
/**
 * Render the pretty-print box output generated by OCaml's Format module
 * (https://caml.inria.fr/pub/docs/manual-ocaml/libref/Format.html)
 */
class FormatPrettyPrint {

    // Simplifier to the "rich" format coq uses.
    richpp2HTML(msg) {

        // Elements are ...
        if (msg.constructor !== Array) {
            return msg;
        }

        var ret;
        var tag, ct, id, att, m;
        [tag, ct] = msg;

        switch (tag) {

        // Element(tag_of_element, att (single string), list of xml)
        case "Element":
            [id, att, m] = ct;
            let imm = m.map(this.richpp2HTML, this);
            ret = "".concat(...imm);
            ret = `<span class="${id}">` + ret + `</span>`;
            break;

        // PCData contains a string
        case "PCData":
            ret = ct;
            break;

        default:
            ret = msg;
        }
        return ret;
    }

    /**
     * Formats a pretty-printed element to be displayed in an HTML document.
     * @param {array} pp a serialized Pp element
     * @param {topBox} string wrap with a box ('vertical' / 'horizontal')
     */
    pp2DOM(pp, topBox) {
        if (!Array.isArray(pp)) {
            throw new Error("malformed Pp element: " + pp);
        }

        if (topBox) {
            var dom = this.pp2DOM(pp);
            return (dom.length == 1 && dom.is('.Pp_box')) ? dom :
                this.makeBox(dom, topBox);
        }

        var [tag, ct] = pp;

        switch (tag) {

        // ["Pp_glue", [...elements]]
        case "Pp_glue":
            return ct.map(x => this.pp2DOM(x)).reduce((a, b) => a.add(b), $([]));

        // ["Pp_string", string]
        case "Pp_string":
            return $(document.createTextNode(ct));

        // ["Pp_box", ["Pp_vbox"/"Pp_hvbox"/"Pp_hovbox", _], content]
        case "Pp_box":
            let [bty, offset] = ct,
                mode = (bty == 'Pp_vbox') ? 'vertical' : 'horizontal';
            return this.makeBox(this.pp2DOM(pp[2]), mode, bty, offset);

        // ["Pp_tag", tag, content]
        case "Pp_tag":
            return this._wrapTrimmed(this.pp2DOM(pp[2]), $('<span>').addClass(ct));

        // ["Pp_force_newline"]
        case "Pp_force_newline":
            return $('<br/>').addClass('Pp_force_newline');

        // ["Pp_print_break", nspaces, indent-offset]
        case "Pp_print_break":
            var [nspaces, indent] = pp.slice(1);
            var spn = (n, c) => $('<span>').text(" ".repeat(n)).addClass(c);
            return $('<span>').addClass('Pp_break').attr('data-args', pp.slice(1))
                .append(spn(nspaces, 'spaces'), $('<br/>'),
                        spn(0, 'prev-indent'), spn(indent, 'indent'));

        case "Pp_empty":
            return $([]);

        default:
            console.warn("unhandled Format case", msg);
            return $([]);
        }
    }

    /**
     * @deprecated use pp2DOM
     */
    pp2HTML(msg, state) {

        // Elements are ...
        if (msg.constructor !== Array) {
            return msg;
        }

        state = state || {breakMode: 'horizontal'};

        var ret;
        var tag, ct;
        [tag, ct] = msg;

        switch (tag) {

        // Element(tag_of_element, att (single string), list of xml)

        // ["Pp_glue", [...elements]]
        case "Pp_glue":
            let imm = ct.map(x => this.pp2HTML(x, state));
            ret = "".concat(...imm);
            break;

        // ["Pp_string", string]
        case "Pp_string":
            if (ct.match(/^={4}=*$/)) {
                ret = "<hr/>";
                state.breakMode = 'skip-vertical';
            }
            else if (state.breakMode === 'vertical' && ct.match(/^\ +$/)) {
                ret = "";
                state.margin = ct;
            }
            else
                ret = ct;
            break;

        // ["Pp_box", ["Pp_vbox"/"Pp_hvbox"/"Pp_hovbox", _], content]
        case "Pp_box":
            var vmode = state.breakMode,
                margin = state.margin ? state.margin.length : 0;

            state.margin = null;

            switch(msg[1][0]) {
            case "Pp_vbox":
                state.breakMode = 'vertical';
                break;
            default:
                state.breakMode = 'horizontal';
            }

            ret = `<div class="Pp_box" data-mode="${state.breakMode}" data-margin="${margin}">` +
                  this.pp2HTML(msg[2], state) +
                  '</div>';
            state.breakMode = vmode;
            break;

        // ["Pp_tag", tag, content]
        case "Pp_tag":
            ret = this.pp2HTML(msg[2], state);
            ret = `<span class="${msg[1]}">` + ret + `</span>`;
            break;

        case "Pp_force_newline":
            ret = "<br/>";
            state.margin = null;
            break;

        // ["Pp_print_break", nspaces, indent-offset]
        case "Pp_print_break":
            ret = "";
            state.margin = null;
            if (state.breakMode === 'vertical'|| (msg[1] == 0 && msg[2] > 0 /* XXX need to count columns etc. */)) {
                ret = "<br/>";
            } else if (state.breakMode === 'horizontal') {
                ret = `<span class="Pp_break" data-args="${msg.slice(1)}"> </span>`;
            } else if (state.breakMode === 'skip-vertical') {
                state.breakMode = 'vertical';
            }
            break;
        
        case "Pp_empty":
            ret = "";
            break;

        default:
            console.warn("unhandled Format case", msg);
            ret = msg;
        }
        return ret;
    }

    pp2Text(msg, state) {

        // Elements are ...
        if (!Array.isArray(msg)) {
            return msg;
        }

        state = state || {breakMode: 'horizontal'};

        var ret;
        var tag, ct;
        [tag, ct] = msg;

        switch (tag) {

        // Element(tag_of_element, att (single string), list of xml)

        // ["Pp_glue", [...elements]]
        case "Pp_glue":
            let imm = ct.map(x => this.pp2Text(x, state));
            ret = "".concat(...imm);
            break;

        // ["Pp_string", string]
        case "Pp_string":
            if (state.breakMode === 'vertical' && ct.match(/^\ +$/)) {
                ret = "";
                state.margin = ct;
            }
            else
                ret = ct;
            break;

        // ["Pp_box", ["Pp_vbox"/"Pp_hvbox"/"Pp_hovbox", _], content]
        case "Pp_box":
            var vmode = state.breakMode,
                margin = state.margin ? state.margin.length : 0;

            state.margin = null;

            switch(msg[1][0]) {
            case "Pp_vbox":
                state.breakMode = 'vertical';
                break;
            default:
                state.breakMode = 'horizontal';
            }

            ret = this.pp2Text(msg[2], state);  /* TODO indent according to margin */
            state.breakMode = vmode;
            break;

        // ["Pp_tag", tag, content]
        case "Pp_tag":
            ret = this.pp2Text(msg[2], state);
            break;

        case "Pp_force_newline":
            ret = "\n";
            state.margin = null;
            break;

        // ["Pp_print_break", nspaces, indent-offset]
        case "Pp_print_break":
            ret = "";
            state.margin = null;
            if (state.breakMode === 'vertical'|| (msg[1] == 0 && msg[2] > 0 /* XXX need to count columns etc. */)) {
                ret = "\n";
            } else if (state.breakMode === 'horizontal') {
                ret = " ";
            } else if (state.breakMode === 'skip-vertical') {
                state.breakMode = 'vertical';
            }
            break;
        
        case "Pp_empty":
            ret = "";
            break;

        default:
            console.warn("unhandled Format case", msg);
            ret = msg;
        }
        return ret;
    }

    msg2DOM(msg) {
        return this.pp2DOM(msg, 'horizontal');
    }

    /**
     * Formats the current proof state.
     * @param {object} goals a record of proof goals 
     *                       ({goals, stack, shelf, given_up})
     */
    goals2DOM(goals) {
        var ngoals = goals.goals.length,
            on_stack = this.flatLength(goals.stack),
            on_shelf = goals.shelf.length,
            given_up = goals.given_up.length;

        function aside(msg) {
            var p = $('<p>').addClass('aside');
            return (typeof msg === 'string') ? p.text(msg) : p.append(msg);
        }

        if (ngoals === 0) {
            /* Empty goals; choose the appropriate message to display */
            let msg = on_stack ? "This subproof is complete, but there are some unfocused goals."
                    : (on_shelf ? "All the remaining goals are on the shelf."
                        : "No more goals."),
                bullet_notice = goals.bullet ? [this.pp2DOM(goals.bullet)] : [],
                given_up_notice = given_up ? 
                    [`(${given_up} goal${given_up > 1 ? 's were' : ' was'} admitted.)`] : [],
                notices = bullet_notice.concat(given_up_notice);

            return $('<div>').append(
                $('<p>').addClass('no-goals').text(msg),
                notices.map(aside)
            );
        }
        else {
            /* Construct a display of all the subgoals (first is focused) */
            let head = ngoals === 1 ? `1 goal` : `${ngoals} goals`,
                notices = on_shelf ? [`(shelved: ${on_shelf})`] : [];

            let focused_goal = this.goal2DOM(goals.goals[0]);

            let pending_goals = goals.goals.slice(1).map((goal, i) =>
                $('<div>').addClass('coq-subgoal-pending')
                    .append($('<label>').text(i + 2))
                    .append(this.pp2DOM(goal.ty)));

            return $('<div>').append(
                $('<p>').addClass('num-goals').text(head),
                notices.map(aside),
                focused_goal, pending_goals
            );
        }
    }

    /**
     * Formats a single, focused goal.
     * Shows an environment containing hypothesis and goal type.
     * @param {object} goal current goal record ({name, hyp, ty})
     */
    goal2DOM(goal) {
        let mklabel = (id) =>
                $('<label>').text(this.constructor._idToString(id)),
            mkdef = (pp) =>
                $('<span>').addClass('def').append(this.pp2DOM(pp));

        let hyps = goal.hyp.reverse().map(([h_names, h_def, h_type]) =>
            $('<div>').addClass(['coq-hypothesis', h_def && 'coq-has-def'])
                .append(h_names.map(mklabel))
                .append(h_def && mkdef(h_def))
                .append($('<div>').append(this.pp2DOM(h_type))));
        let ty = this.pp2DOM(goal.ty);
        return $('<div>').addClass('coq-env').append(hyps, $('<hr/>'), ty);
    }

    static _idToString(id) { // this is, unfortunately, duplicated from CoqManager :/
        /**/ console.assert(id[0] === 'Id') /**/
        return id[1];
    }

    flatLength(l) {
        return Array.isArray(l) 
            ? l.map(x => this.flatLength(x)).reduce((x,y) => x + y, 0)
            : 1;
    }

    makeBox(jdom, mode, bty, offset) {
        return $('<div>').addClass('Pp_box').append(jdom)
            .attr({'data-mode': mode, 'data-bty': bty, 'data-offset': offset});
    }

    /**
     * This attempts to mimic the behavior of `Format.print_break` in relation
     * to line breaks.
     * @param {jQuery} jdom a DOM subtree produced by `pp2DOM` or `goals2DOM`.
     */
    adjustBreaks(jdom) {
        var width = jdom.width(),
            boxes = jdom.find('.Pp_box');

        /** @todo should probably reset the state of all breaks, in case `adjustBreaks` is called a second time e.g. after resize */

        function closest($el, p) {
            return [...$el.parents()].find(p);
        }
        function isBlockLike(el) {
            return BLOCK_LIKE.includes(window.getComputedStyle(el).display);
        }
        function contentLeft(el) { // get offset where content actually starts (after left padding)
            // using the `firstChild` cleverly skips the padding, but oh it assumes so much...
            return el.firstChild.offsetLeft;
        }

        function breakAt(brk, boxOffset = 0, boxOffsetLeft = 0) {
            var offsetText = " ".repeat(boxOffset);
            brk.addClass('br')
                .children('.prev-indent').text(offsetText)
                .css({marginLeft: boxOffsetLeft})
        }

        for (let el of boxes) {
            let box = $(el),
                mode = box.attr('data-mode') || 'horizontal',
                offset = +box.attr('data-offset') || 0,
                offsetLeft = box[0].offsetLeft - contentLeft(closest(box, isBlockLike)),
                brks = box.children('.Pp_break');
            if (mode == 'horizontal') {  /** @todo hov mode */
                var prev = null;
                for (let brk of brks) {
                    if (prev && $(brk).position().left >= width)
                        breakAt(prev, offset, offsetLeft);
                    prev = $(brk);
                }
                if (prev && box.position().left + box.width() > width)
                    breakAt(prev, offset, offsetLeft);
            }
            else /* vertical */ {
                for (let brk of brks) {
                    $(brk).children('.prev-indent').text('')
                        .css({marginLeft: offsetLeft})
                }
            }
        }

        if (this._isFlat(jdom))
            jdom.addClass("text-only");
    }

    _isFlat(jdom) {
        return jdom.find('.Pp_break').length == 0;
    }

    /**
     * Auxiliary method that wraps a node with an element, but excludes
     * leading and trailing spaces. These are attached outside the wrapper.
     * 
     * So _wrapTrimmed(" ab", <span>) becomes " "<span>"ab"</span>.
     */
    _wrapTrimmed(jdom, wrapper_jdom) {
        if (jdom.length === 0) return wrapper_jdom;  // degenerate case

        var first = jdom[0], last = jdom[jdom.length - 1],
            lead, trail;

        if (first.nodeType === Node.TEXT_NODE) {
            lead = first.nodeValue.match(/^\s*/)[0];
            first.nodeValue = first.nodeValue.substring(lead.length);
        }

        if (last.nodeType === Node.TEXT_NODE) { // note: it can be the same node
            trail = last.nodeValue.match(/\s*$/);
            last.nodeValue = last.nodeValue.substring(0, trail.index);
            trail = trail[0];
        }

        return $([lead && document.createTextNode(lead),
                  wrapper_jdom.append(jdom)[0], 
                  trail && document.createTextNode(trail)].filter(x => x));
    }

}


const BLOCK_LIKE = ['block', 'inline-block', 'inline-flex', 'inline-table', 'inline-grid'];


if (typeof module !== 'undefined')
    module.exports = {FormatPrettyPrint}

// Local Variables:
// js-indent-level: 4
// End:
