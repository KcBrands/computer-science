(function () {
  "use strict";

  // Answers are emailed with FormSubmit (https://formsubmit.co), a free service that
  // forwards a form post to an email address. It needs no account or API key; the
  // first post to a new address sends that address a one-time "Activate Form" email.
  var MAIL_ENDPOINT = "https://formsubmit.co/ajax/";
  var STORE_PREFIX = "coupleapp:";

  // Wording that depends on who is asking (requester's gender) and for what (role).
  var ASKER = {
    m: { me: "boyfriend", he: "he", him: "him", himself: "himself", heWas: "he was", heIs: "he's", hePlans: "he plans", rivals: "men", spouse: "husband", treat: "a man" },
    w: { me: "girlfriend", he: "she", him: "her", himself: "herself", heWas: "she was", heIs: "she's", hePlans: "she plans", rivals: "women", spouse: "wife", treat: "a woman" },
    n: { me: "partner", he: "they", him: "them", himself: "themselves", heWas: "they were", heIs: "they're", hePlans: "they plan", rivals: "people", spouse: "spouse", treat: "me" },
  };
  var ROLE = {
    g: { role: "girlfriend", friendKind: "female" },
    b: { role: "boyfriend", friendKind: "male" },
    p: { role: "partner", friendKind: "close" },
  };

  var view = document.getElementById("view");
  var stepLabel = document.getElementById("stepLabel");
  var progressWrap = document.getElementById("progressWrap");
  var progressBar = document.getElementById("progressBar");

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(STORE_PREFIX + key) || "null");
      if (val === null) localStorage.removeItem(STORE_PREFIX + key);
      else localStorage.setItem(STORE_PREFIX + key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  function b64urlEncode(str) {
    return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlDecode(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    return decodeURIComponent(escape(atob(str)));
  }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
  function baseUrl() { return location.href.split("#")[0].split("?")[0]; }

  var toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toastEl.classList.remove("show"); }, 2000);
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { toast("Copied!"); });
    }
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("Copied!"); } catch (e) { toast("Couldn't copy, select it manually"); }
    document.body.removeChild(ta);
    return Promise.resolve();
  }
  function setChrome(label, pct) {
    stepLabel.textContent = label || "";
    progressWrap.hidden = pct == null;
    if (pct != null) progressBar.style.width = Math.round(pct * 100) + "%";
  }
  function bottomBar(html) {
    var old = document.querySelector(".bottombar");
    if (old) old.remove();
    if (!html) return null;
    var bar = document.createElement("div");
    bar.className = "bottombar";
    bar.innerHTML = '<div class="inner">' + html + "</div>";
    document.body.appendChild(bar);
    return bar;
  }
  function top() { window.scrollTo(0, 0); view.focus({ preventScroll: true }); }

  function sendMail(to, payload) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
    return fetch(MAIL_ENDPOINT + encodeURIComponent(to), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        clearTimeout(timer);
        var ok = res.ok && String(data.success) === "true";
        return { ok: ok, message: data.message || ("HTTP " + res.status) };
      });
    }, function (err) {
      clearTimeout(timer);
      return { ok: false, message: err && err.name === "AbortError" ? "The request timed out." : "Network error." };
    });
  }

  // ---------- link encoding ----------
  // A link carries the requester's email, name, gender and wanted role, packed into
  // the URL hash so nothing has to be stored on a server.
  function makeCode(req) { return b64urlEncode([req.email, req.name, req.gender, req.role].join("\n")); }
  function readCode(code) {
    try {
      var parts = b64urlDecode(code).split("\n");
      var req = { email: parts[0], name: parts[1], gender: parts[2], role: parts[3] };
      if (!validEmail(req.email) || !req.name || !ASKER[req.gender] || !ROLE[req.role]) return null;
      return req;
    } catch (e) { return null; }
  }
  function linkFor(req) { return baseUrl() + "#/a/" + makeCode(req); }

  function wordsFor(req) {
    var w = {}, k;
    for (k in ASKER[req.gender]) w[k] = ASKER[req.gender][k];
    for (k in ROLE[req.role]) w[k] = ROLE[req.role][k];
    w.Role = cap(w.role);
    w.name = req.name;
    return w;
  }
  function fill(str, w) {
    return str.replace(/\{(\w+)\}/g, function (m, k) { return w[k] != null ? w[k] : m; });
  }

  // ---------- router ----------
  function route() {
    var h = location.hash;
    var m = h.match(/^#\/a\/([A-Za-z0-9_-]+)/);
    if (m) {
      var req = readCode(m[1]);
      if (req) return Applicant(req, m[1]);
      return renderBadLink();
    }
    return renderCreate();
  }
  window.addEventListener("hashchange", route);

  // =====================================================================
  // Requester: create a link
  // =====================================================================
  function renderCreate() {
    setChrome("", null);
    var saved = store("me") || { name: "", email: "", gender: "m", role: "g" };
    view.innerHTML =
      '<p class="kicker">For the one hiring</p>' +
      "<h1>Applications are now open ‼️</h1>" +
      '<p class="muted">Create your personal application link, send it to whoever is interested, and their answers land in your email inbox as soon as they hit submit.</p>' +
      '<form class="card" id="createForm" novalidate>' +
        '<div class="q"><label class="q-label" for="cName">Your first name</label>' +
          '<input type="text" id="cName" autocomplete="given-name" maxlength="40" value="' + esc(saved.name) + '" placeholder="e.g. Mansa">' +
          '<div class="q-error">Add your name so applicants know who they\'re applying to.</div></div>' +
        '<div class="q"><label class="q-label" for="cEmail">Email to receive answers</label>' +
          '<input type="email" id="cEmail" autocomplete="email" inputmode="email" value="' + esc(saved.email) + '" placeholder="you@example.com">' +
          '<div class="q-error">Enter a valid email address.</div></div>' +
        '<div class="q"><label class="q-label" for="cGender">I am a…</label>' +
          '<select id="cGender">' +
            opt("m", "Man (\"he/him\")", saved.gender) +
            opt("w", "Woman (\"she/her\")", saved.gender) +
            opt("n", "Prefer neutral wording (\"they/them\")", saved.gender) +
          "</select></div>" +
        '<div class="q"><label class="q-label" for="cRole">Position open</label>' +
          '<select id="cRole">' +
            opt("g", "Girlfriend", saved.role) + opt("b", "Boyfriend", saved.role) + opt("p", "Partner", saved.role) +
          "</select></div>" +
        '<button class="btn primary block" type="submit">Create my link</button>' +
      "</form>" +
      '<div id="createResult"></div>' +
      '<div class="card"><h3>How it works</h3>' +
        '<ol class="small muted" style="margin:0;padding-left:20px">' +
          "<li>Create your link above and activate email delivery (one time only).</li>" +
          "<li>Copy the link into your bio, story, DMs, WhatsApp… anywhere.</li>" +
          "<li>Applicants fill in all 12 sections on their phone.</li>" +
          "<li>You get an email with every answer, their self-rating score and any red flags detected.</li>" +
        "</ol></div>";
    bottomBar(null);

    function opt(v, label, cur) { return '<option value="' + v + '"' + (v === cur ? " selected" : "") + ">" + esc(label) + "</option>"; }

    var form = document.getElementById("createForm");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = document.getElementById("cName").value.trim();
      var email = document.getElementById("cEmail").value.trim();
      var nameQ = document.getElementById("cName").parentNode;
      var emailQ = document.getElementById("cEmail").parentNode;
      nameQ.classList.toggle("invalid", !name);
      emailQ.classList.toggle("invalid", !validEmail(email));
      if (!name || !validEmail(email)) return;
      var req = { name: name, email: email, gender: document.getElementById("cGender").value, role: document.getElementById("cRole").value };
      var prev = store("me");
      if (prev && prev.email.toLowerCase() !== email.toLowerCase()) req.activated = false;
      else req.activated = !!(prev && prev.activated);
      store("me", req);
      showLink(req);
    });

    if (saved.email && saved.name) showLink(saved);
  }

  function showLink(req) {
    var link = linkFor(req);
    var box = document.getElementById("createResult");
    var role = ROLE[req.role].role;
    box.innerHTML =
      '<div class="card">' +
        "<h3>Your application link</h3>" +
        '<a class="linkbox" id="theLink" href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(link) + "</a>" +
        '<div class="btn-row">' +
          '<button class="btn primary" type="button" id="copyBtn">Copy link</button>' +
          (navigator.share ? '<button class="btn ghost" type="button" id="shareBtn">Share…</button>' : "") +
        "</div>" +
        '<div class="btn-row"><button class="btn ghost" type="button" id="copyCaption">Copy link with caption</button></div>' +
      "</div>" +
      '<div class="card" id="activateCard">' +
        "<h3>" + (req.activated ? "✅ Email delivery" : "⚠️ Activate email delivery") + "</h3>" +
        '<p class="small muted">Answers are delivered by FormSubmit. The very first time, it sends <b>' + esc(req.email) +
          '</b> an email with an <b>Activate Form</b> button. Click it once, before you share your link, or the first application can be lost.</p>' +
        '<div id="activateMsg"></div>' +
        '<button class="btn ' + (req.activated ? "ghost" : "primary") + ' block" type="button" id="activateBtn">' +
          (req.activated ? "Send me a test email" : "Send activation email") + "</button>" +
        '<label class="check" style="margin-top:12px"><input type="checkbox" id="activatedChk"' + (req.activated ? " checked" : "") +
          "> I clicked “Activate Form” in the email</label>" +
      "</div>";

    var caption = cap(role) + " applications are now open ‼️ Apply here: " + link;
    document.getElementById("copyBtn").onclick = function () { copyText(link); };
    document.getElementById("copyCaption").onclick = function () { copyText(caption); };
    var shareBtn = document.getElementById("shareBtn");
    if (shareBtn) shareBtn.onclick = function () {
      navigator.share({ title: cap(role) + " Application", text: cap(role) + " applications are now open ‼️", url: link }).catch(function () {});
    };
    document.getElementById("activatedChk").onchange = function () {
      req.activated = this.checked;
      store("me", req);
    };
    document.getElementById("activateBtn").onclick = function () {
      var btn = this, msg = document.getElementById("activateMsg");
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span> Sending…';
      sendMail(req.email, {
        _subject: "CoupleApplication: email delivery is working",
        _template: "box",
        _captcha: "false",
        message: "This is a test from CoupleApplication. Applications sent to your link (" + link + ") will arrive at this address.",
      }).then(function (r) {
        btn.disabled = false;
        btn.textContent = "Send again";
        if (r.ok) {
          msg.innerHTML = '<div class="note ok">Sent! Your inbox is active. Check ' + esc(req.email) + " for the test email.</div>";
          req.activated = true;
          store("me", req);
          document.getElementById("activatedChk").checked = true;
        } else if (/activat/i.test(r.message)) {
          msg.innerHTML = '<div class="note">📬 Check ' + esc(req.email) + " (and your spam folder) for an email from FormSubmit and click <b>Activate Form</b>. Then tick the box below.</div>";
        } else {
          msg.innerHTML = '<div class="note danger">Couldn\'t send: ' + esc(r.message) + "</div>";
        }
      });
    };
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderBadLink() {
    setChrome("", null);
    bottomBar(null);
    view.innerHTML =
      '<div class="hero-emoji">🔗</div><h1>This link doesn\'t look right</h1>' +
      '<p class="muted">The application link may have been cut off when it was copied. Ask the person who sent it to copy it again.</p>' +
      '<a class="btn ghost block" href="#/">Create your own link instead</a>';
  }

  // =====================================================================
  // Applicant: fill in the form
  // =====================================================================
  function Applicant(req, code) {
    var w = wordsFor(req);
    var sections = window.FORM_SECTIONS;
    var draftKey = "draft:" + code;
    var draft = store(draftKey) || { answers: {}, step: 0 };
    var answers = draft.answers;
    var step = draft.step || 0;
    var total = sections.length + 2; // intro + sections + sign
    document.title = cap(w.role) + " Application · " + req.name;

    if (store("sent:" + code)) return renderDone(true);

    function save() { store(draftKey, { answers: answers, step: step }); }

    function render() {
      if (step === 0) return renderIntro();
      if (step <= sections.length) return renderSection(sections[step - 1]);
      return renderSign();
    }

    function go(n) { step = n; save(); render(); top(); }

    function renderIntro() {
      setChrome("", 0);
      view.innerHTML =
        '<p class="kicker">' + esc(cap(w.role)) + " Application Form · " + new Date().getFullYear() + "</p>" +
        "<h1>" + esc(req.name) + "'s " + esc(w.Role) + " applications are now open ‼️</h1>" +
        '<div class="card"><dl class="facts">' +
          "<dt>Position</dt><dd>" + esc(req.name) + "'s " + esc(w.Role) + "</dd>" +
          "<dt>Department</dt><dd>" + esc(req.name) + "'s Heart &amp; Happiness</dd>" +
          "<dt>Contract</dt><dd>Long-term, renewable indefinitely</dd>" +
          "<dt>Application fee</dt><dd>Free, but wasting " + esc(req.name) + "'s time will result in immediate rejection.</dd>" +
        "</dl></div>" +
        '<div class="card"><h3>Before you start</h3><ul class="small muted" style="margin:0;padding-left:20px">' +
          "<li>12 sections plus a final interview. About 10 minutes.</li>" +
          "<li>Your progress is saved on this phone, so you can come back to it.</li>" +
          "<li>When you submit, your answers are sent privately to " + esc(req.name) + ".</li>" +
        "</ul></div>";
      var bar = bottomBar('<button class="btn primary" id="next">' + (Object.keys(answers).length ? "Continue application" : "Start application") + "</button>");
      bar.querySelector("#next").onclick = function () { go(Object.keys(answers).length && draft.step ? draft.step : 1); };
    }

    function renderSection(sec) {
      setChrome("Step " + step + " of " + (total - 1), step / (total - 1));
      var html = '<p class="kicker">' + (sec.number ? "Section " + sec.number : "&nbsp;") + "</p>" +
        "<h2>" + esc(fill(sec.title, w)) + "</h2>" +
        (sec.note ? '<div class="note danger">' + esc(sec.note) + "</div>" : "") +
        '<form id="secForm" class="card" novalidate>';
      sec.questions.forEach(function (q) { html += questionHtml(q); });
      html += "</form>";
      view.innerHTML = html;
      wire(sec);
      var bar = bottomBar('<button class="btn ghost" id="back" aria-label="Back">←</button><button class="btn primary" id="next">' + (step === sections.length ? "Review & sign" : "Next") + "</button>");
      bar.querySelector("#back").onclick = function () { go(step - 1); };
      bar.querySelector("#next").onclick = function () {
        var bad = validate(sec);
        if (bad) {
          bad.scrollIntoView({ behavior: "smooth", block: "center" });
          var f = bad.querySelector("input,textarea,button");
          if (f) f.focus({ preventScroll: true });
          return;
        }
        go(step + 1);
      };
    }

    function questionHtml(q) {
      var label = esc(fill(q.label, w));
      var a = answers[q.id];
      var head = '<div class="q" data-q="' + q.id + '">';
      var opt = q.optional ? ' <span class="opt">(optional)</span>' : "";
      var err = '<div class="q-error">' + (q.type === "ratings" ? "Rate yourself on every item." : "Please answer this one.") + "</div></div>";
      if (q.type === "text" || q.type === "number") {
        return head + '<label class="q-label" for="f_' + q.id + '">' + label + opt + "</label>" +
          '<input id="f_' + q.id + '" data-id="' + q.id + '" ' +
          (q.type === "number" ? 'type="number" inputmode="numeric" min="16" max="120"' : 'type="text"') +
          ' value="' + esc(a || "") + '">' + err;
      }
      if (q.type === "textarea") {
        return head + '<label class="q-label" for="f_' + q.id + '">' + label + opt + "</label>" +
          '<textarea id="f_' + q.id + '" data-id="' + q.id + '" rows="3">' + esc(a || "") + "</textarea>" + err;
      }
      if (q.type === "choice") {
        var cur = a || {};
        var h = head + '<div class="q-label" id="l_' + q.id + '">' + label + opt + '</div><div class="choices" role="radiogroup" aria-labelledby="l_' + q.id + '">';
        q.options.forEach(function (o, i) {
          var text = fill(o.label, w);
          var sel = cur.value === text;
          h += '<label class="choice' + (sel ? " selected" : "") + '"><input type="radio" name="' + q.id + '" value="' + i + '"' + (sel ? " checked" : "") + '><span class="dot"></span><span>' + esc(text) + "</span></label>";
          if (o.more) {
            h += '<input type="text" class="more" data-more="' + q.id + '" placeholder="' + esc(o.more) + '" value="' + esc(sel ? cur.more || "" : "") + '"' + (sel ? "" : " hidden") + ">";
          }
        });
        return h + "</div>" + err;
      }
      if (q.type === "scale") {
        return head + '<div class="q-label">' + label + opt + "</div>" + scaleHtml(q.id, a) + err;
      }
      if (q.type === "ratings") {
        var r = a || {};
        var hh = head + '<div class="q-label">' + label + "</div>";
        q.items.forEach(function (item, i) {
          var t = fill(item, w);
          hh += '<div class="rating-row"><div class="r-label"><span>' + esc(t) + '</span><span class="r-val">' + (r[t] ? r[t] + "/10" : "–") + "</span></div>" + scaleHtml(q.id + ":" + i, r[t]) + "</div>";
        });
        return hh + err;
      }
      return "";
    }

    function scaleHtml(key, val) {
      var h = '<div class="scale" data-scale="' + key + '">';
      for (var n = 1; n <= 10; n++) h += '<button type="button" data-n="' + n + '" aria-pressed="' + (val === n) + '">' + n + "</button>";
      return h + "</div>";
    }

    function wire(sec) {
      var form = document.getElementById("secForm");
      form.addEventListener("submit", function (e) { e.preventDefault(); });
      form.addEventListener("input", function (e) {
        var t = e.target;
        if (t.dataset.id) answers[t.dataset.id] = t.value;
        if (t.dataset.more) { answers[t.dataset.more] = answers[t.dataset.more] || {}; answers[t.dataset.more].more = t.value; }
        clearInvalid(t);
        save();
      });
      form.addEventListener("change", function (e) {
        var t = e.target;
        if (t.type !== "radio") return;
        var q = findQ(sec, t.name);
        var o = q.options[+t.value];
        answers[q.id] = { value: fill(o.label, w), flag: !!o.flag, more: "" };
        var group = t.closest(".q");
        group.querySelectorAll(".choice").forEach(function (c) { c.classList.toggle("selected", c.contains(t)); });
        group.querySelectorAll("input.more").forEach(function (m) { m.hidden = true; m.value = ""; });
        var more = t.closest(".choice").nextElementSibling;
        if (more && more.classList.contains("more")) { more.hidden = false; more.focus(); }
        clearInvalid(t);
        save();
      });
      form.addEventListener("click", function (e) {
        var b = e.target.closest(".scale button");
        if (!b) return;
        var key = b.parentNode.dataset.scale, n = +b.dataset.n;
        b.parentNode.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
        var parts = key.split(":");
        var q = findQ(sec, parts[0]);
        if (q.type === "ratings") {
          var item = fill(q.items[+parts[1]], w);
          answers[q.id] = answers[q.id] || {};
          answers[q.id][item] = n;
          b.closest(".rating-row").querySelector(".r-val").textContent = n + "/10";
        } else {
          answers[q.id] = n;
        }
        clearInvalid(b);
        save();
      });
    }
    function clearInvalid(el) { var q = el.closest(".q"); if (q) q.classList.remove("invalid"); }
    function findQ(sec, id) { for (var i = 0; i < sec.questions.length; i++) if (sec.questions[i].id === id) return sec.questions[i]; }

    function isAnswered(q) {
      var a = answers[q.id];
      if (q.type === "choice") return !!(a && a.value);
      if (q.type === "scale") return typeof a === "number";
      if (q.type === "ratings") return !!a && q.items.every(function (it) { return a[fill(it, w)]; });
      return typeof a === "string" && a.trim() !== "";
    }
    function validate(sec) {
      var first = null;
      sec.questions.forEach(function (q) {
        var ok = q.optional || isAnswered(q);
        var el = view.querySelector('[data-q="' + q.id + '"]');
        el.classList.toggle("invalid", !ok);
        if (!ok && !first) first = el;
      });
      return first;
    }

    function renderSign() {
      setChrome("Step " + (total - 1) + " of " + (total - 1), 1);
      var sig = answers._signature || answers.fullName || "";
      view.innerHTML =
        '<p class="kicker">Almost done</p><h2>Important notice</h2>' +
        '<div class="card small">' +
          "<p style=\"margin-top:0\">Submitting this application does NOT guarantee employment. Successful candidates will undergo further screening, including consistency checks, communication assessments, loyalty testing and an extremely serious “Do you actually know how to treat " + esc(w.treat) + "?” evaluation.</p>" +
          "<h3>Probation period</h3><p style=\"margin-bottom:0\">Good morning texts alone do not constitute satisfactory performance.</p>" +
        "</div>" +
        '<form class="card" id="signForm" novalidate>' +
          '<div class="q" data-q="_signature"><label class="q-label" for="sig">Applicant signature (type your full name)</label>' +
            '<input type="text" id="sig" autocomplete="name" value="' + esc(sig) + '" style="font-family:\'Snell Roundhand\',\'Segoe Script\',cursive;font-size:22px">' +
            '<div class="q-error">Sign with your name to submit.</div></div>' +
          '<div class="q" data-q="_truthful"><label class="check"><input type="checkbox" id="truthful"' + (answers._truthful ? " checked" : "") + "> By signing, I confirm that all information provided is truthful.</label>" +
            '<div class="q-error">You have to confirm this to submit.</div></div>' +
          '<p class="small muted" style="margin:0">Date: ' + new Date().toLocaleDateString() + "</p>" +
        "</form>" +
        '<div id="sendMsg"></div>';
      document.getElementById("sig").oninput = function () { answers._signature = this.value; clearInvalid(this); save(); };
      document.getElementById("truthful").onchange = function () { answers._truthful = this.checked; clearInvalid(this); save(); };
      var bar = bottomBar('<button class="btn ghost" id="back" aria-label="Back">←</button><button class="btn primary" id="send">Submit application</button>');
      bar.querySelector("#back").onclick = function () { go(step - 1); };
      bar.querySelector("#send").onclick = submit;
    }

    function submit() {
      var sigOk = (answers._signature || "").trim() !== "";
      view.querySelector('[data-q="_signature"]').classList.toggle("invalid", !sigOk);
      view.querySelector('[data-q="_truthful"]').classList.toggle("invalid", !answers._truthful);
      if (!sigOk || !answers._truthful) return;

      // Make sure nothing was skipped (e.g. answers cleared on another tab).
      for (var s = 0; s < sections.length; s++) {
        for (var i = 0; i < sections[s].questions.length; i++) {
          var q = sections[s].questions[i];
          if (!q.optional && !isAnswered(q)) { toast("A question in “" + fill(sections[s].title, w) + "” still needs an answer"); return go(s + 1); }
        }
      }

      var btn = document.getElementById("send");
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span> Submitting…';
      var report = buildReport();
      sendMail(req.email, report.payload).then(function (r) {
        if (r.ok) {
          store("sent:" + code, { at: Date.now() });
          store(draftKey, null);
          renderDone(false);
          return;
        }
        btn.disabled = false;
        btn.textContent = "Try again";
        var msg = document.getElementById("sendMsg");
        msg.innerHTML =
          '<div class="note danger">Your application couldn\'t be delivered automatically (' + esc(r.message) + '). Nothing is lost: send it yourself instead.</div>' +
          '<div class="btn-row">' +
            '<a class="btn primary" href="mailto:' + encodeURIComponent(req.email) + "?subject=" + encodeURIComponent(report.subject) + "&body=" + encodeURIComponent(report.text.slice(0, 1800) + (report.text.length > 1800 ? "\n\n[…full answers copied: paste below]" : "")) + '">Send by email</a>' +
            '<button class="btn ghost" type="button" id="copyAnswers">Copy my answers</button>' +
          "</div>";
        document.getElementById("copyAnswers").onclick = function () { copyText(report.text); };
        msg.scrollIntoView({ behavior: "smooth" });
      });
    }

    function buildReport() {
      var name = answers.fullName || "Applicant";
      var subject = "💌 New " + w.role + " application: " + name + (answers.age ? ", " + answers.age : "");
      var flags = [];
      var score = 0, scoreMax = 0;
      var rows = [];
      sections.forEach(function (sec) {
        var title = (sec.number ? sec.number + ". " : "") + fill(sec.title, w);
        rows.push(["━━ " + title.toUpperCase() + " ━━", " "]);
        sec.questions.forEach(function (q) {
          var a = answers[q.id], label = fill(q.label, w), val;
          if (q.type === "choice") {
            val = a ? a.value + (a.more ? ": " + a.more : "") : "-";
            if (a && a.flag) { val = "🚩 " + val; flags.push(label + " → " + a.value); }
          } else if (q.type === "ratings") {
            val = q.items.map(function (it) {
              var t = fill(it, w), n = (a || {})[t] || 0;
              score += n; scoreMax += 10;
              return t + ": " + (n || "-") + "/10";
            }).join(" · ");
          } else if (q.type === "scale") {
            val = a ? a + "/10" : "-";
          } else {
            val = a && String(a).trim() ? String(a).trim() : "-";
          }
          rows.push([label, val]);
        });
      });
      var summary = [
        ["Applicant", name],
        ["Self-rated duties score", score + " / " + scoreMax + " (" + Math.round((score / (scoreMax || 1)) * 100) + "%)"],
        ["Red flags detected", flags.length ? flags.length + ": " + flags.join(" | ") : "None 🎉"],
        ["Signed", (answers._signature || "") + " on " + new Date().toLocaleString()],
      ];
      var all = summary.concat(rows);

      // FormSubmit needs unique field names, so each one is numbered.
      var payload = { _subject: subject, _template: "table", _captcha: "false" };
      all.forEach(function (r, i) {
        var key = (i < 9 ? "0" : "") + (i + 1) + " " + r[0].replace(/[\[\]]/g, "");
        payload[key.slice(0, 200)] = r[1];
      });
      var text = all.map(function (r) { return r[1] === " " ? "\n" + r[0] : r[0] + "\n" + r[1]; }).join("\n\n");
      return { subject: subject, payload: payload, text: subject + "\n\n" + text };
    }

    function renderDone(already) {
      setChrome("", null);
      bottomBar(null);
      view.innerHTML =
        '<div style="text-align:center;padding-top:24px">' +
          '<div class="hero-emoji">💌</div>' +
          '<div class="stamp">' + (already ? "ALREADY SUBMITTED" : "UNDER REVIEW") + "</div>" +
          "<h1>Application " + (already ? "already sent" : "submitted!") + "</h1>" +
          '<p class="muted">Your answers were sent to ' + esc(req.name) + ". Successful candidates will be contacted. Good morning texts alone do not constitute satisfactory performance.</p>" +
        "</div>" +
        '<div class="card small"><h3>HR use only</h3><p class="muted" style="margin:0">Application reviewed by: ' + esc(req.name) + "<br>Status: ☐ Approved ☐ Shortlisted for interview ☑ Under review ☐ Rejected</p></div>" +
        '<a class="btn ghost block" href="#/">Open applications of your own</a>' +
        (already ? '<button class="btn ghost block" style="margin-top:10px" id="again">Submit a new application</button>' : "");
      var again = document.getElementById("again");
      if (again) again.onclick = function () { store("sent:" + code, null); route(); };
      top();
    }

    render();
    top();
  }

  route();
})();
