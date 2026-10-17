// Runs student JavaScript in a worker with a hard timeout. Same result shape as PY.run + sim.
const JSR = (() => {
  function friendly(err) {
    const s = (err.name ? err.name + ": " : "") + err.message;
    const tips = [
      [/robot is not defined/, "In the Mirror Sea, robot already exists. No import needed, but check the spelling."],
      [/is not defined/, "Something isn't defined. Check spelling and capital letters. JavaScript is case-sensitive."],
      [/Unexpected token|Unexpected end|missing \)/, "JavaScript can't read this line. Check matching ( ) and { } and semicolons."],
      [/is not a function/, "robot has no command called that. Commands: move, jump, turn_left, turn_right, turn_around, wait, pick, press, say, sees, scan, done, has_key."],
      [/Pinched|Splash|got tired/, null],
    ];
    for (const [re, tip] of tips) if (re.test(s)) return { raw: s, tip };
    return { raw: s, tip: null };
  }

  function run(code, level, grid, timeoutMs = 3000) {
    return new Promise((resolve) => {
      let worker;
      try { worker = new Worker("js/worker.js"); }
      catch (e) { resolve({ error: { raw: "Could not start the JavaScript runner: " + e.message, tip: "Open the game from a web server (not a file:// path)." }, events: [], output: "" }); return; }
      const plainLevel = { goal: level.goal, startDir: level.startDir || 0 };
      const timer = setTimeout(() => { worker.terminate(); resolve({ error: { raw: "Your code ran for more than 3 seconds.", tip: "A while loop that never ends? Make sure the condition eventually becomes false." }, events: [], output: "" }); }, timeoutMs);
      worker.onmessage = (e) => { clearTimeout(timer); worker.terminate(); const d = e.data; resolve({ events: d.events, output: d.output, error: d.error ? friendly(d.error) : null, evalMsg: d.evalMsg, gems: d.gems }); };
      worker.onerror = (e) => { clearTimeout(timer); worker.terminate(); resolve({ error: { raw: e.message || "Worker error", tip: null }, events: [], output: "" }); };
      worker.postMessage({ grid, level: plainLevel, code });
    });
  }
  return { run };
})();
window.JSR = JSR;
