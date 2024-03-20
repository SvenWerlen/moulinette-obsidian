import { MoulinetteObsidian } from "./moulinette-obsidian.js";

/*************************
 * Moulinette Exporter
 *************************/
export class MoulinetteObsidianExporter extends FormApplication {
  
  constructor() {
    super()
  }
  
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "moulinette-exporter",
      classes: ["mtte", "sources"],
      title: game.i18n.localize("mtte.moulinetteObsidianExporter"),
      template: "modules/moulinette-obsidian/templates/exporter.hbs",
      width: 500,
      closeOnSubmit: false,
      submitOnClose: false,
    });
  }
  
  getData() {
    const settings = game.settings.get("moulinette-obsidian", "lastsettings")
    const docs = []
    docs.push({ id: 'scenes', name: game.i18n.localize("DOCUMENT.Scenes"), checked: settings.exportScenes })
    docs.push({ id: 'actors', name: game.i18n.localize("DOCUMENT.Actors"), checked: settings.exportActors })
    docs.push({ id: 'items', name: game.i18n.localize("DOCUMENT.Items"), checked: settings.exportItems })
    docs.push({ id: 'articles', name: game.i18n.localize("DOCUMENT.JournalEntries"), checked: settings.exportArticles })
    docs.push({ id: 'tables', name: game.i18n.localize("DOCUMENT.RollTables"), checked: settings.exportTables })

    const perms = []
    game.users.forEach(u => {
      perms.push({
        id: u.id,
        name: u.name,
        selected: u.id == game.userId
      })
    })
    return {
      documents: docs,
      perms: perms,
    }
  }

  _updateObject(event, inputs) {
    event.preventDefault();
    
    const settings = {
      exportScenes: inputs["scenes"] == "1",
      exportActors: inputs["actors"] == "1",
      exportItems: inputs["items"] == "1",
      exportArticles: inputs["articles"] == "1",
      exportTables: inputs["tables"] == "1"
    }
    game.settings.set("moulinette-obsidian", "lastsettings", settings);
    
    MoulinetteObsidian.exportWorld(settings)
  }

}

