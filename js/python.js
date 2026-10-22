// Skulpt bridge: runs real Python in the browser and exposes a `robot` module
// whose functions call the current Sim instance.

const PY = (() => {
  let outputBuf = [];

  function installRobotModule() {
    const simple = ["jump", "turn_left", "turn_right", "turn_around", "wait", "pick", "press"];
    const getters = ["done", "has_key", "facing", "bag_count", "x", "y", "scan"];
    Sk.builtinFiles.files["src/lib/robot.js"] = `
var $builtinmodule = function (name) {
  var mod = {};
  function sim() { var s = window.__sim; if (!s) throw new Sk.builtin.RuntimeError("no world loaded"); return s; }
  function wrap(fn) { try { return fn(); } catch (e) { if (e && e.name === "RobotFail") throw new Sk.builtin.RuntimeError(e.message); throw e; } }
  mod.move = new Sk.builtin.func(function (n) { var k = n === undefined ? 1 : Sk.ffi.remapToJs(n); wrap(function(){ sim().move(k); }); return Sk.builtin.none.none$; });
  mod.say = new Sk.builtin.func(function (t) { wrap(function(){ sim().say(Sk.ffi.remapToJs(t)); }); return Sk.builtin.none.none$; });
  mod.sees = new Sk.builtin.func(function (w) { return Sk.ffi.remapToPy(wrap(function(){ return sim().sees(Sk.ffi.remapToJs(w)); })); });
  ${simple.map(n => `mod.${n} = new Sk.builtin.func(function () { wrap(function(){ sim().${n}(); }); return Sk.builtin.none.none$; });`).join("\n  ")}
  ${getters.map(n => `mod.${n} = new Sk.builtin.func(function () { return Sk.ffi.remapToPy(wrap(function(){ return sim().${n}(); })); });`).join("\n  ")}
  return mod;
};`;
  }

  function configure() {
    Sk.configure({
      output: (t) => outputBuf.push(t),
      read: (x) => {
        if (Sk.builtinFiles === undefined || Sk.builtinFiles.files[x] === undefined) throw "File not found: '" + x + "'";
        return Sk.builtinFiles.files[x];
      },
      __future__: Sk.python3,
      execLimit: 4000,
    });
  }

  function friendly(err) {
    const s = String(err);
    const tips = [
      [/NameError: name 'robot'/, "Add  import robot  at the top."],
      [/NameError/, "Something isn't defined. Check spelling and capital letters."],
      [/SyntaxError|bad input|bad token/, "Python can't read this line. Check colons at the end of for/if/def lines and matching parentheses."],
      [/IndentationError|unindent|expected an indented block/, "Indent with 4 spaces inside for / if / def blocks."],
      [/AttributeError: 'module' object has no attribute '(\w+)'/, "robot has no command called that. Commands: move, jump, turn_left, turn_right, turn_around, wait, pick, press, say, sees, scan, done, has_key."],
      [/TimeLimitError|execLimit/, "Your code ran too long. A while loop that never ends?"],
      [/TypeError.*takes/, "Wrong number of things in the parentheses."],
      [/Pinched|Splash|got tired/, null],
    ];
    for (const [re, tip] of tips) if (re.test(s)) return { raw: s, tip };
    return { raw: s, tip: null };
  }

  async function run(code, sim) {
    if (typeof Sk === "undefined") throw new Error("Skulpt (the Python engine) failed to load. Check your internet connection and refresh.");
    if (!Sk.builtinFiles.files["src/lib/robot.js"]) installRobotModule();
    configure();
    outputBuf = []; window.__sim = sim;
    let module = null, error = null;
    try {
      module = await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody("<stdin>", false, code, true));
    } catch (e) { error = friendly(e); }
    window.__sim = null;
    return { module, output: outputBuf.join(""), error };
  }

  function call(module, name, args) {
    const fn = module.$d[name];
    if (!fn) return { error: "No function named " + name + "(). Did you write def " + name + "(...)?" };
    try {
      const r = Sk.misceval.callsimArray(fn, args.map(a => Sk.ffi.remapToPy(a)));
      return { value: Sk.ffi.remapToJs(r) };
    } catch (e) { return { error: friendly(e).raw }; }
  }

  return { run, call };
})();
window.PY = PY;
