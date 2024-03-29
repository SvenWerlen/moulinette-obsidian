/**
 * Moulinette Obsidian
 * 
 * Utility functions to sync/export/import from/to Obsidian MD
 */

export class MoulinetteObsidian {

  /**
   * Returns the folder path from the asset
   */
  static getFolderPath(folder) {
    if(!folder) return ""
    const path = folder.name + "/"
    return folder.folder ? MoulinetteObsidian.getFolderPath(folder.folder) + path : path
  }

  /**
   * Retrieves and returns template as string 
   */
  static async getTemplate(templateName) {
    const response = await fetch(`modules/moulinette-obsidian/templates/${templateName}.md`)
    if(response.ok) {
      return response.text()
    } else {
      console.error("Moulinette Obsidian | Cannot retrieve template", response)
      return ""
    }
  }

  /**
   * Clean filenames to avoid conflicts in MD
   */
  static cleanFilename(filename) {
    return filename.replace(/[^0-9a-zA-Z_\- ]/g, '')
  }

  /**
   * Uploads the content (string) as markdown file
   */
  static async uploadMarkdown(content, filename, folder) {
    const mdFile = new File([content], filename, {type: 'text/plain', lastModified: new Date()});
    await game.moulinette.applications.MoulinetteFileUtil.uploadFile(mdFile, filename, folder, true)
  }

  /**
   * Uploads the content (string) as markdown file
   */
  static async uploadBinary(fvttPath, filename, folder, overwrite = true) {
    try {
      const response = await fetch(fvttPath, { method: 'GET', headers: { 'Content-Type': 'application/octet-stream' }})
      const blob = await response.blob()
      const binFile = new File([blob], filename, { type: blob.type, lastModified: new Date() });
      await game.moulinette.applications.MoulinetteFileUtil.uploadFile(binFile, filename, folder, overwrite)
    } catch(error) {
      console.error("Moulinette Obsidian | Couldn't retrieve file from path : ", fvttPath)
      console.error(error)
    }
  }

  /**
   * Generates a Markdown text listing all elements
   * 
   * @param {object} elementList dict object with key = folder, value = Markdown row
   * @param {string} tableTemplate markdown template for that table
   * @returns 
   */
  static generateList(elementList, tableTemplate) {
    let allElements = ""
    let currentElements = ""
    let currentFolder = ""
    Object.keys(elementList).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).forEach((k) => {
      const folder = k.substring(0, k.lastIndexOf("/"))
      if(folder != currentFolder) {
        if(currentElements.length > 0) {
          allElements += tableTemplate.replace("LIST", currentElements)
        }
        allElements += `\n\n### ${folder} \n\n`
        currentElements = ""
        currentFolder = folder
      }
      currentElements += elementList[k]
    })
    allElements += tableTemplate.replace("LIST", currentElements)
    return allElements
  }

  /**
   * Retrieves the object's value based on the path
   * 
   * @param {object} object FVTT instance
   * @param {string} path path to value
   */
  static getValue(object, path) {
    // count
    if(path.startsWith("#")) {
      const value = foundry.utils.getProperty(object, path.substring(1))
      return "" + (value ? value.size : 0)
    } else {
      const value = foundry.utils.getProperty(object, path)
      return value ? "" + value : ""
    }
    
  }

  /**
   * Download all dependencies found in HTML content
   * Support <img> tags
   * 
   * @param {string} htmlContent HTML content to scan (and replace)
   * @param {string} folder folder where to store dependencies
   * @param {string} vaultLocalPath vault local path
   * @returns 
   */
  static async downloadDependencies(htmlContent, folder) {
    const imgRefs = [...htmlContent.matchAll(/<img [^>]*src=[\\]?"([^"]+)[\\]?"/g)]
    for(const ref of imgRefs) {
      if(ref[1].toLowerCase().startsWith("http")) continue
      const filename = ref[1].split("/").pop().split("?")[0]
      const relFolder = ref[1].slice(0, -(filename.length+1))
      await MoulinetteObsidian.uploadBinary(ref[1], filename, folder + "/_Deps/" + relFolder, false)
      htmlContent = htmlContent.replace('"' + ref[1], `"_Deps/${relFolder}/${filename}`)
    }
    return htmlContent
  }

  static replaceReferences(htmlContent) {
    // looking for references like @UUID[Scene.VqzwFaG1Zvm5YsWc]{Dragon's Keep Basement Floor}
    const refs = [...htmlContent.matchAll(/@UUID\[([^\]]+)\]\{([^\}]+)\}/g)]
    for(const ref of refs) {
      htmlContent = htmlContent.replace(ref[0], `<code title="${ref[1]}">${ref[2]}</code>`)
    }
    // looking for references like [[/r 3d6[psychic]]]{3d6 Psychic Damage}
    const macros = [...htmlContent.matchAll(/\[\[([^­\}]+)\{([^}]+)\}/g)]
    for(const ref of macros) {
      htmlContent = htmlContent.replace(ref[0], `<code title="${ref[1].slice(0,-2)}">${ref[2]}</code>`)
    }
    return htmlContent
  }

  /**
   * For each mapping, look for its value and replace KEY by the found VALUE
   * @param {string} text Text to be processed
   * @param {object} obj FVTT object instance
   * @param {object} mappings Dict with mapping [KEY] = [PATH]
   * @returns 
   */
  static applyMappings(text, obj, mappings) {
    text = text.replace(new RegExp("ASSETUUID", 'g'), MoulinetteObsidian.getValue(obj, "uuid"));
    if(mappings) {
      for (const [key, path] of Object.entries(mappings)) {
        text = text.replace(new RegExp(key, 'g'), MoulinetteObsidian.getValue(obj, path));
      }
    }
    return text
  }

  /**
   * Processes the list of all assets of given type, retrieving templates, replacing values, etc.
   * 
   * @param {string} assetType Type of assets (ex: Scenes or Actors)
   * @param {array} assets List of assets
   * @param {string} permissions from specified user
   * @param {MoulinetteProgress} progressbar (for continuous updates)
   * @param {string|async function} img Image path location within asset OR function generate the image (ex: for scene)
   * @param {object} mapping List of mappings (key|path) of values to be replaced in tables
   * @param {async function} content Function generating Markdown content for a specific asset (must return string)
   */
  static async processAssets(assetType, assets, permissions, progressbar, image, mappings, content) {
    const FILEUTIL = game.moulinette.applications.MoulinetteFileUtil
    const rootFolder = `moulinette-obsidian/${game.world.id}`

    let assetList = {}
    const assetFolder = `${rootFolder}/${assetType}`
    await FILEUTIL.createFolderRecursive(assetFolder)
    const assetTemplate = await MoulinetteObsidian.getTemplate(assetType.toLowerCase().replace(/ /g, "-") + "-page")
    const assetListTemplate = await MoulinetteObsidian.getTemplate(assetType.toLowerCase().replace(/ /g, "-") + "-list")
    let assetTableTemplate = await MoulinetteObsidian.getTemplate(assetType.toLowerCase().replace(/ /g, "-") + "-table")
    let assetTableRowTemplate = assetTableTemplate.match(/##([^#]+)##/)
    if(assetTableRowTemplate) {
      assetTableTemplate = assetTableTemplate.substring(0, assetTableRowTemplate.index)
      assetTableRowTemplate = assetTableRowTemplate[1]
    }

    // filter all assets based on specified user
    let filteredCount = 0
    const user = game.users.find(u => u.id == permissions) || game.user

    for(const a of assets) {

      progressbar.setProgress(100 * progressbar.idx / progressbar.count, game.i18n.format("mtte.exportingType", { documentType: assetType}))

      if(a.testUserPermission(user, "LIMITED")) {        
        const relFolder = MoulinetteObsidian.getFolderPath(a.folder)
        const folder = relFolder.length > 0 ? `${assetFolder}/${relFolder}` : assetFolder + "/"
        
        let assetData = assetTemplate.replace("ASSETNAME", a.name)
        assetData = MoulinetteObsidian.applyMappings(assetData, a, mappings)
        if(content) {
          assetData = assetData.replace("ASSETCONTENT", await content(a, rootFolder))
        }

        const name = MoulinetteObsidian.cleanFilename(a.name)
        let assetTableRow = assetTableRowTemplate.replace("ASSETNAME", `[[${assetType}/${relFolder}${name}\\|${name}]]`)
        assetTableRow = MoulinetteObsidian.applyMappings(assetTableRow, a, mappings)
        
        if(image) {
          // image is the path within the asset object which contains the image location
          if (typeof image === 'string' || image instanceof String) {
            if(!a[image]) {
              assetData = assetData.replace("ASSETIMG", "")
              assetTableRow = assetTableRow.replace("ASSETIMG", "")
            }
            else if(a[image].startsWith("http")) {
              assetData = assetData.replace("ASSETIMG", `![${name}|150](${a[image]})`)
              assetTableRow = assetTableRow.replace("ASSETIMG", `![${name}\\|100](${a[image]})`)
            }
            else {
              const ext = a[image].split('.').pop().split('?')[0];
              const assetImg = `${assetType}/${relFolder}${name}.${ext}` 
              await MoulinetteObsidian.uploadBinary(a[image], `${name}.${ext}`, folder)    
              assetData = assetData.replace("ASSETIMG", `![[${assetImg}|150]]`)
              assetTableRow = assetTableRow.replace("ASSETIMG", `![[${assetImg}\\|100]]`)
            }
          } 
          // image is the function to generate an image for that asset
          else {
            const assetImg = `${assetType}/${relFolder}${name}.webp`
            await image(a, folder, `${name}.webp`)
            assetData = assetData.replace("ASSETIMG", `![[${assetImg}|150]]`)
            assetTableRow = assetTableRow.replace("ASSETIMG", `![[${assetImg}\\|100]]`)
          }
        }

        await MoulinetteObsidian.uploadMarkdown(assetData, `${name}.md`, folder)    
        assetList[`${relFolder}/${name}`] = assetTableRow + "\n"

        filteredCount++
      }

      progressbar.idx++
    }

    const assetsMD = MoulinetteObsidian.generateList(assetList, assetTableTemplate)
    await MoulinetteObsidian.uploadMarkdown(assetListTemplate.replace("ASSETLIST", assetsMD), `All ${assetType}.md`, rootFolder)

    return filteredCount
  }

  /**
   * Generates all the required files for Obsidian
   */
  static async exportWorld({ exportScenes=true, exportActors=true, exportItems=true, exportArticles=true, exportTables=true, permissions=null } = {}) {
    const FILEUTIL = game.moulinette.applications.MoulinetteFileUtil
    const rootFolder = `moulinette-obsidian/${game.world.id}`
    
    let count = 0
    if(exportScenes) count += game.scenes.size
    if(exportActors) count += game.actors.size
    if(exportItems) count += game.items.size
    if(exportArticles) count += game.journal.size
    if(exportTables) count += game.tables.size

    let scenesCount = 0
    let actorsCount = 0
    let itemsCount = 0
    let articlesCount = 0
    let tablesCount = 0
    
    const progressbar = new game.moulinette.applications.MoulinetteProgress(game.i18n.localize("mtte.exporting"))
    progressbar.idx = 0
    progressbar.count = count
    progressbar.render(true)

    // export scenes
    // -------------
    if(exportScenes) {
      scenesCount = await MoulinetteObsidian.processAssets("Scenes", game.scenes, permissions, progressbar, async function(sc, folder, filename) {
        const width = 600
        const height = (sc.height / sc.width) * 600;
        const thumb = await sc.createThumbnail({width:width, height:height, format: "image/webp", quality: 0.8 })
        const blob = FILEUTIL.b64toBlob(thumb.thumb)
        const mdFileThumb = new File([blob], filename, { type: blob.type, lastModified: new Date() })
        await FILEUTIL.uploadFile(mdFileThumb, filename, folder, true)

        // clear cache to avoid (or mitigate) memory leaks
        for(const key of PIXI.Assets.cache._cacheMap.keys()) {
          await PIXI.Assets.unload(key)
        }
      });
    }

    // export actors
    // -------------
    if(exportActors) {
      const mappings = {
        "ACTORHPCUR": "system.attributes.hp.value",
        "ACTORHPMAX": "system.attributes.hp.max",
      }
      actorsCount = await MoulinetteObsidian.processAssets("Actors", game.actors, permissions, progressbar, "img", mappings, async function(a, folder) {
        let content = await MoulinetteObsidian.downloadDependencies(MoulinetteObsidian.getValue(a, "system.details.biography.value"), folder)
        content = await MoulinetteObsidian.replaceReferences(content)
        if(content.length == 0) {
          content = "*No biography*"
        }
        return content
      });
    }

    // export items
    // -------------
    if(exportItems) {
      const mappings = {
        "ITEMQUANTITY": "system.quantity",
        "ITEMWEIGHT": "system.weight",
        "ITEMPRICE": "system.price.value",
        "ITEMCURRENCY": "system.price.denomination"
      }
      itemsCount = await MoulinetteObsidian.processAssets("Items", game.items, permissions, progressbar, "img", mappings, async function(i, folder) {
        let content = await MoulinetteObsidian.downloadDependencies(MoulinetteObsidian.getValue(i, "system.description.value"), folder)
        content = await MoulinetteObsidian.replaceReferences(content)
        if(content.length == 0) {
          content = "*No description*"
        }
        return content
      });
    }

    // export articles
    // -------------
    if(exportArticles) {
      const mappings = {
        "PAGES": "#pages"
      }
      articlesCount = await MoulinetteObsidian.processAssets("Articles", game.journal, permissions, progressbar, null, mappings, async function(a, folder) {
        let content = ""
        for(const p of a.pages) {
          content += `---\n\n## ${p.name}\n\n`
          if(p.text && p.text.content) {
            //content += jQuery('<div>').html(p.text.content).text();
            let pageHTML = await MoulinetteObsidian.downloadDependencies(p.text.content, folder)
            pageHTML = await MoulinetteObsidian.replaceReferences(pageHTML)
            content += pageHTML
          } else {
            content += "*No content*"
          }
          content += "\n\n"
        }
        return content
      });
    }

    // export rollable tables
    // -------------
    if(exportTables) {
      const mappings = {
        "TABLEFORMULA": "formula"
      }
      tablesCount = await MoulinetteObsidian.processAssets("Rollable Tables", game.tables, permissions, progressbar, "img", mappings, async function(t, folder) {
        let content = await MoulinetteObsidian.downloadDependencies(MoulinetteObsidian.getValue(t, "description"), folder)
        content = await MoulinetteObsidian.replaceReferences(content)
        
        // generate table
        content += "\n\n### Table Results\n\n" + 
          "| Range | Description |\n" +
          "| ---   | --- |\n"
        if(t.collections && t.collections.results) {
          for(const r of t.collections.results) {
            let text = await MoulinetteObsidian.replaceReferences(MoulinetteObsidian.getValue(r, "text"))
            text = await MoulinetteObsidian.replaceReferences(text)
            content += `| ${r.range[0]}-${r.range[1]} | ${text} |\n`
          }
        }
        return content
      });
    }

    progressbar.setProgress(100)

    // home page
    const homeTemplate = await MoulinetteObsidian.getTemplate("home")
    let homeHTML = homeTemplate.replace("WORLDNAME", game.world.title)
    homeHTML = homeHTML.replace("SCENES#", exportScenes ? `| [[All Scenes\\|Scenes]] | ${scenesCount} |\n` : "" )
      .replace("ACTORS#", exportActors ? `| [[All Actors\\|Actors]] | ${actorsCount} |\n`: "" )
      .replace("ITEMS#", exportItems ? `| [[All Items\\|Items]] | ${itemsCount} |\n` : "" )
      .replace("ARTICLES#", exportArticles ? `| [[All Articles\\|Articles]] | ${articlesCount} |\n` : "" )
      .replace("ROLLTABLES#", exportTables ? `| [[All Rollable Tables\\|Rollable Tables]] | ${tablesCount} |\n` : "" )
            
    const description = await MoulinetteObsidian.downloadDependencies(MoulinetteObsidian.getValue(game.world, "description"), rootFolder)
    homeHTML = homeHTML.replace("WORLDDESCRIPTION", description)
    
    await MoulinetteObsidian.uploadMarkdown(homeHTML, `Home.md`, rootFolder)
  }
}