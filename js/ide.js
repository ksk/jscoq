var IDELayout;
var Editor;

(function(){

    Array.prototype.last = function() { return this[this.length-1]; };

    IDELayout = function() {

        this.buttons      = document.getElementById('buttons');
        this.script_panel  = document.getElementById('script-panel');
        this.goal_text     = document.getElementById("goal-text");
        this.message_panel = document.getElementById('message-panel');
        this.editor        = new Editor('coq', this.script_panel.getElementsByTagName('textarea')[0]);

        var self = this;
        window.addEventListener('load', function(evt){ self.onload(evt); });
    };

    IDELayout.prototype.onload = function(evt) {

        // Load JsCoq
        var self           = this;
        var jscoqscript    = document.createElement('script');
        jscoqscript.type   = 'text/javascript';
        jscoqscript.src    = 'coq-js/jscoq.js';
        jscoqscript.onload = function(evt){self.setupCoq(evt);};
        document.head.appendChild(jscoqscript);
    };


    IDELayout.prototype.enable = function() {
        var self = this;
        this.buttons.addEventListener('click', function(evt){ self.toolbarClickHandler(evt); });
        this.buttons.style.opacity = 1;
        this.script_panel.addEventListener('keydown', function(evt) { self.keydownHandler(evt); });
    };

    IDELayout.prototype.setupCoq = function() {

        var self = this;

        jsCoq.onError = function(e){
            self.editor.popStatement(true);
        };

        jsCoq.onLog   = function(e){
            console.log("CoqLog: " + e.toString());

            // Hacks, we should refine...

            // Error msg.
            if (e.toString().indexOf("ErrorMsg:") != -1)
                // Sanitize
                self.addToQueryBuffer(e.toString().replace(/^.*ErrorMsg:/, ""));
            // User queries, usually in the query buffer
            else if (e.toString().indexOf("Msg:") != -1)
                self.addToQueryBuffer(e.toString().replace(/^.*Msg:/, ""));
        };

        jsCoq.onInit = function(e){

            document.getElementById("goal-text").textContent += "\n===> JsCoq filesystem initalized with success!";
            // Enable the IDE.
            self.enable();
        };

        // Initial sid.
        jsCoq.sid = [];
        jsCoq.sid.push(jsCoq.init());

        this.goal_text.textContent = jsCoq.version() + "\nPlease wait for the libraries to load, thanks!";
    };

    IDELayout.prototype.addToQueryBuffer = function(text) {

        // Due to the way Coq works we use a <pre> tag...
        var span = document.createElement('span');
        span.appendChild(document.createElement('pre')).textContent = text;
        this.message_panel.insertBefore(span, this.message_panel.firstChild);
    };

    IDELayout.prototype.toolbarClickHandler = function(evt) {

        var target = evt.target;

        switch (target.name) {

            case 'ceiling' :
                /*
                  FIXME [EG]: This need to yield back to the browser
                  content in every iteration so the user sees the
                  progress.
                */
                while(this.editor.popStatement(false));
                break;

            case 'floor' :
                while(this.editor.eatNextStatement());
                break;

            case 'up' :
                this.editor.popStatement(false);
                break;

            case 'down' :
                this.editor.eatNextStatement();
                break;
        }
    };

    IDELayout.prototype.keydownHandler = function(evt) {

        // console.log("Keycode: " + evt.keycode + ", alt: " + evt.altKey);

        switch(evt.keyCode) {

        case 78:
            if(evt.metaKey || evt.altKey) {
                this.editor.eatNextStatement();
            }
            break;
        case 80:
            if(evt.metaKey || evt.altKey) {
                this.editor.popStatement(false);
            }
            break;
        }
    };

    Editor = function(name, element) {

        this.idgen = new IDGen();

        // Statements holds the code already sent to Coq.
        this.statements = [];

        this._editor = CodeMirror.fromTextArea(element,
            {mode : {name : "coq",
                     version: 3,
                     singleLineStringErrors : false
                   },
             lineNumbers   : true,
             indentUnit    : 4,
             matchBrackets : true,
             theme : 'blackboard'
            }
        );

        var self = this;
        this._editor.on('change', function(evt){ self.onCMChange(evt); });
    };

    /* EG:
     *
     * I'm not still sure how we want to do it, but I think we want to
     * maintain a richer structure of the Coq's document.
     *
     * Parsing should be done asynchronously (as in Emacs) and the
     * user should get some feedback out of it.
     *
     */

    // Returns the next token after the one seen at position: {line:…, ch:…}
    // type_re: regexp to match token type.
    // The returned object is a CodeMirror token with an additional attribute 'line'.
    Editor.prototype.getNextToken = function(position, type_re) {
        var cm = this._editor;
        var linecount = cm.getDoc().lineCount();
        var token, next, ch, line;
        do {
            token = cm.getTokenAt(position);
            ch = token.end + 1;
            line = position.line;
            if (token.end === cm.getLine(line).length) {
                line++;
                ch = 0;
                if (line >= linecount)
                    return null;
            }
            next = cm.getTokenAt({line:line, ch:ch});
            next.line = line;
            position = {line:next.line, ch:next.end};
        } while(type_re && !(type_re.test(next.type)));
        return next;
    };

    // Send next statement to Coq.
    Editor.prototype.eatNextStatement = function() {

        var cm    = this._editor;
        var doc   = cm.getDoc();
        var start = {line : 0, ch : 0};

        // get last evaluated statement
        if (this.statements.length) {

            var lastStm = this.statements.last();
            start = lastStm.end;

            if (start.line === doc.lastLine() &&
                start.ch === doc.getLine(doc.lastLine()).length) {
                return false;
            }
        }

        var token = this.getNextToken(start, /statementend/);
        if(!token) return false;

        var stm = new Statement(start,
                                {line : token.line,
                                 ch   : token.end},
                                doc.getRange({line : start.line, ch : start.ch},
                                             {line : token.line, ch : token.end}),
                                token.type === 'comment'
                               );

        // Add the statement to our list.
        stm.id = this.idgen.next();
        this.statements.push(stm);
        stm.position = this.statements.length - 1;

        // EG: The stm should gain eid and sid properties.

        // In fact, there are 3 states for a statement: new, parsed,
        // and executed/errored.
        this.coqEval(stm);
        return true;
    };

    Editor.prototype.coqEval = function(stm) {

        // Mark the statement
        var doc  = this._editor.getDoc();

        // XXX: Quack!
        var mark;
        if(stm.is_comment) {
            mark = doc.markText(stm.start, stm.end, {className : 'coq-eval-ok'});
            mark.stm = stm;
            stm.mark = mark;
            return;
        }
        mark = doc.markText(stm.start, stm.end, {className : 'coq-eval-pending'});
        mark.stm = stm;
        stm.mark = mark;

        // We should be fully event driven here...

        // Two things can happen: a parsing error (thus we will never get a sid),
        // of a succesful parse, we get a sid.

        // EG: For now we use a hack, parsing error returns 0
        var nsid = jsCoq.add(jsCoq.sid.last(), -1, stm.text);

        // Should we hook in the check add to request the commit after
        // the parse feedback?
        if (nsid) {

            // Try to execute it.
            jsCoq.sid.push(nsid);
            jsCoq.commit(nsid);

            // Commit was successful
            if (nsid == jsCoq.sid.last()) {
                mark.clear();
                mark = doc.markText(stm.start, stm.end, {className : 'coq-eval-ok'});
                mark.stm = stm;
                stm.mark = mark;

              // Print goals
              document.getElementById("goal-text").textContent = jsCoq.goals();
            }
        } else { // Parse/library loading error.
            // XXXX: Similar to popStatement but without sid handling.
            stm = this.statements.pop();

            stm.mark.clear();
            mark = doc.markText(stm.start, stm.end, {className : 'coq-eval-failed'});
            mark.stm = stm;
            stm.mark = mark;
            this.errorMark = stm.mark;
        }
    };

    // Back...
    Editor.prototype.popStatement = function(is_error) {

        // This is very important, we cannot unload the prelude.
        if (this.statements.length <= 1)
            return false;

        // Clear the last errorMark
        if(this.errorMark) {
            this.errorMark.clear();
            this.errorMark = null;
        }

        // Clear the mark from the last statement.
        var stm = this.statements.pop();
        stm.mark.clear();

        // Mark errors as failed... We need a pending stack for this to work fine...
        if(is_error) {
            var doc  = this._editor.getDoc();
            mark = doc.markText(stm.start, stm.end, {className : 'coq-eval-failed'});
            mark.stm = stm;
            stm.mark = mark;
            this.errorMark = mark;
        }

        if(stm.is_comment)
            return true;

        // Drop the last sid
        jsCoq.sid.pop();
        // And tell coq to go back to the old state.
        jsCoq.edit(jsCoq.sid.last());

        // Update goals
        document.getElementById("goal-text").textContent = jsCoq.goals();
        return true;
    };

    // This is an event, shouldn't it return true?
    Editor.prototype.onCMChange = function(evt) {

        var doc   = this._editor.getDoc();
        var marks = doc.findMarksAt(doc.getCursor());

        if (this.statements.length <= 1)
            return;

        if (marks.length === 1) {
            for (var i = this.statements.length - 1 ; i >= marks[0].stm.position ; i-- ) {
                this.popStatement();
            }
        }
    };

    var IDGen = function() {
        this.id = 1;
    };

    IDGen.prototype.next = function() {
        this.id--;
        return this.id;
    };

    var Statement = function(start, end, text, is_comment) {
        // start, end: {line: l, ch: c}
        this.start = start;
        this.end = end;
        this.text = text;
        this.is_comment = is_comment;
        this.id = 0;
        this.mark = undefined;
    };
}());

// Local Variables:
// js-indent-level: 4
// End:
