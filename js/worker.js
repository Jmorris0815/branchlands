// Web Worker that runs student JavaScript against the Sim, off the main thread,
// so an infinite loop can be killed by terminating the worker.
importScripts("sim.js");

self.onmessage = (e) => {
  const { grid, level, code } = e.data;
  const sim = new Sim(level, grid);
  const robot = robotApi(sim);
  const out = [];
  const fakeConsole = { log: (...a) => out.push(a.map(String).join(" ")) };
  let error = null;
  try {
    const fn = new Function("robot", "console", "window", "self", "globalThis", "importScripts", "fetch", "XMLHttpRequest", '"use strict";\n' + code);
    fn(robot, fakeConsole, undefined, undefined, undefined, undefined, undefined, undefined);
  } catch (err) {
    error = { name: err && err.name, message: err && err.message ? err.message : String(err) };
  }
  self.postMessage({ events: sim.events, output: out.join("\n"), error, evalMsg: sim.evaluate(), gems: sim.gems, robot: sim.robot });
};
