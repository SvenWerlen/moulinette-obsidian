
/**
 * Setup: defines add a default module (Forge)
 */
Hooks.once("ready", async function () {
  game.moulinette.applications["MoulinetteObsidian"] = (await import("./modules/moulinette-obsidian.js")).MoulinetteObsidian
});

