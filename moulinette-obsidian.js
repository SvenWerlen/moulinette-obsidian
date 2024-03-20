Hooks.once("init", async function () {
  console.log("Moulinette Obsidian | Init") 
  game.settings.register("moulinette-obsidian", "lastsettings", { scope: "world", config: false, type: Object, default: {} })
});

Hooks.once("ready", async function () {
  game.moulinette.applications["MoulinetteObsidian"] = (await import("./modules/moulinette-obsidian.js")).MoulinetteObsidian
  game.moulinette.applications["MoulinetteObsidianExporter"] = (await import("./modules/moulinette-exporter.js")).MoulinetteObsidianExporter

  // adds shortcut into Game Settings
  $('#settings-game').append(`<button class="moulinette-export-obsidian" data-action="moulinette-export-obsidian"><i class="fas fa-file-export"></i> ${game.i18n.localize("mtte.export2obsidian")}</button>`);
  $('#settings-game .moulinette-export-obsidian').click(() => {
    (new game.moulinette.applications.MoulinetteObsidianExporter()).render(true)
  })
});

