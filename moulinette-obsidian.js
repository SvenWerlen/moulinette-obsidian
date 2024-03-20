Hooks.once("init", async function () {
  console.log("Moulinette Obsidian | Init") 
  game.settings.register("moulinette-obsidian", "lastsettings", { scope: "world", config: false, type: Object, default: {} })
});

Hooks.once("ready", async function () {
  game.moulinette.applications["MoulinetteObsidian"] = (await import("./modules/moulinette-obsidian.js")).MoulinetteObsidian
  game.moulinette.applications["MoulinetteObsidianExporter"] = (await import("./modules/moulinette-exporter.js")).MoulinetteObsidianExporter
});

