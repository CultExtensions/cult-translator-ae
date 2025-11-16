//target aftereffects
(function AE_GPT_BasicUI_Panel_Batched_Delimited_v100_Recursive(thisObj){
    // ====== CLIENT CONFIG (no provider keys here) ======
    // Keep as placeholder; we'll auto-load from license.json next to this script.
    var LICENSE_KEY = "LICENSE";
    var PROXY_URL   = "https://ae-translate-proxy.onrender.com/translate";
    // ==================================

    // ---- constants ----
    var IS_WIN = ($.os && $.os.indexOf("Windows") === 0);
    var CURL   = IS_WIN ? "curl" : "/usr/bin/curl"; // or hardcode: "C:\\Windows\\System32\\curl.exe"
    var MODEL  = "gpt-4o-mini"; // you can change to "gpt-4o" if desired

    // Toggle to quickly see license/curl info once; leave false for production
    var DEBUG_SHOW_ONCE = false;

    // --- Master language list used by BOTH dropdowns (exactly 100) ---
    var LANGS_RAW =
"English|Spanish|Spanish (Mexico)|Spanish (Spain)|Portuguese (Brazil)|Portuguese (Portugal)|French|German|Italian|Dutch|Russian|Ukrainian|Polish|Czech|Slovak|Hungarian|Romanian|Bulgarian|Greek|Turkish|Hebrew|Arabic (Standard)|Arabic (Egypt)|Arabic (Levant)|Persian (Farsi)|Dari|Pashto|Kurdish (Kurmanji)|Kurdish (Sorani)|Armenian|Georgian|Azerbaijani|Kazakh|Uzbek|Tajik|Mongolian|Chinese (Simplified)|Chinese (Traditional)|Cantonese|Japanese|Korean|Thai|Vietnamese|Indonesian|Malay|Filipino (Tagalog)|Lao|Khmer|Burmese|Sinhala|Nepali|Hindi|Urdu|Bengali|Punjabi (Gurmukhi)|Marathi|Gujarati|Tamil|Telugu|Kannada|Malayalam|Odia|Swahili|Amharic|Somali|Oromo|Yoruba|Igbo|Hausa|Wolof|Kinyarwanda|Shona|Zulu|Xhosa|Afrikaans|Malagasy|Quechua|Aymara|Guarani|Nahuatl (Central)|K’iche’|Haitian Creole|Jamaican Patois|Papiamento|Galician|Catalan|Basque|Swedish|Danish|Norwegian (Bokmål)|Finnish|Estonian|Latvian|Lithuanian|Icelandic|Slovenian|Croatian|Serbian|Macedonian|Albanian";

    function makeLangList(raw){
        var arr = raw.split("|");
        var clean = [];
        var seen = {};
        var i, s;
        for (i=0;i<arr.length;i++){
            s = arr[i];
            while (s.length && (s.charAt(0)===" " || s.charAt(0)==="\t" || s.charAt(0)==="\n" || s.charAt(0)==="\r")) s = s.substring(1);
            while (s.length && (s.charAt(s.length-1)===" " || s.charAt(s.length-1)==="\t" || s.charAt(s.length-1)==="\n" || s.charAt(s.length-1)==="\r")) s = s.substring(0, s.length-1);
            if (s && !seen[s]) { clean[clean.length]=s; seen[s]=1; }
        }
        clean.sort(); // ASCII sort, legacy-safe
        return clean;
    }
    var SRC_LANGS = makeLangList(LANGS_RAW);
    var TGT_LANGS = makeLangList(LANGS_RAW);

    // ---- tiny utils (legacy-safe) ----
    function trim(s){ return (s||"").replace(/^[\s\r\n\t]+|[\s\r\n\t]+$/g,""); }
    function sanitize(s){ if(!s) return ""; return s.replace(/[\u0000-\u001F\u007F-\u009F]/g,""); }
    function jsonEscape(s) {
        if (s===null || s===undefined) return "";
        s = ""+s;
        s = s.replace(/\\/g, "\\\\");
        s = s.replace(/"/g, "\\\"");
        s = s.replace(/\r/g, "\\r");
        s = s.replace(/\n/g, "\\n");
        s = s.replace(/\t/g, "\\t");
        return s;
    }
    function writeTextFile(f, txt){
        try{ f.encoding="UTF-8"; f.lineFeed="Unix"; if(!f.open("w")) return false; f.write(txt); f.close(); return true; }catch(e){ try{f.close();}catch(_){}
        return false; }
    }
    function readTextFile(f){
        try{ f.encoding="UTF-8"; if(!f.open("r")) return ""; var t=f.read(); f.close(); return t; }catch(e){ try{f.close();}catch(_){}
        return ""; }
    }
    function run(cmd){ try{ return system.callSystem(cmd) || ""; }catch(e){ return ""; } }
    function alertIf(s){ try{ alert(s); }catch(e){} }

    function openUrl(url) {
        if (!url) return;
        try {
            if (IS_WIN) {
                run('cmd /c start "" "' + url + '"');
            } else {
                run('/usr/bin/open "' + url + '"');
            }
        } catch (e) {
            alertIf("Please open this URL in your browser:\n\n" + url);
        }
    }

    // --- universalized matchNames for text access ---
    var TEXT_PROPS_MATCHNAME = "ADBE Text Properties";
    var TEXT_DOC_MATCHNAME   = "ADBE Text Document";

    function getSourceTextProp(layer) {
        if (!layer || layer.matchName !== "ADBE Text Layer") return null;
        var textProps = layer.property(TEXT_PROPS_MATCHNAME);
        if (!textProps) return null;
        return textProps.property(TEXT_DOC_MATCHNAME) || null;
    }

    // --- get a simple, stable device id (cross-platform) ---
    function getDeviceId(){
        var name;
        if (IS_WIN) {
            name = trim(run('hostname'));
        } else {
            name = trim(run('/usr/sbin/scutil --get ComputerName'));
            if (!name) name = trim(run('/bin/hostname'));
        }
        if (!name) name = "unknown-device";
        return name.replace(/[\r\n\t"'\`]/g, ' ');
    }

    // --- auto-load license from license.json sitting next to this script ---
    function loadLicenseFromSiblingFile(){
        try{
            var scriptFile = File($.fileName);
            var folder = scriptFile && scriptFile.parent ? scriptFile.parent : null;
            if (!folder) return "";
            var licFile = File(folder.fsName + "/license.json");
            if (!licFile.exists) return "";
            if (!licFile.open("r")) return "";
            var txt = licFile.read(); licFile.close();

            // Prefer JSON.parse; fallback to eval only if JSON is unavailable.
            var obj = (typeof JSON !== "undefined" && JSON.parse) ? JSON.parse(txt) : eval("(" + txt + ")");
            var k = obj && obj.license ? (""+obj.license) : "";
            return trim(k);
        }catch(e){
            return "";
        }
    }

    function ensureLicense(){
        var k = trim(loadLicenseFromSiblingFile());
        if (!k || k === "LICENSE") { k = trim(LICENSE_KEY||""); }
        if (!k || k === "LICENSE") {
            alertIf("Missing license.\n\nDownload with the personalized installer or place a license.json next to CultTranslator.jsx.\n(You can also paste your key into the script constant if needed.)");
            return "";
        }
        return trim(k);
    }

    function getActiveComp(){
        var c = app.project && app.project.activeItem;
        if(!c || !(c instanceof CompItem)){ alertIf("Open/select a composition first."); return null; }
        return c;
    }

    // --- recursively collect text layers from a CompItem (avoid cycles via visited map)
    function collectTextLayersFromComp(comp, out, visited) {
        if (!comp || !(comp instanceof CompItem)) return;
        if (!visited) visited = {};
        var key = comp.id ? ("" + comp.id) : ("name:" + comp.name);
        if (visited[key]) return;
        visited[key] = 1;

        for (var i = 1; i <= comp.numLayers; i++) {
            var L = comp.layer(i);
            if (L.matchName === "ADBE Text Layer") out[out.length] = L;
            if (L.source && (L.source instanceof CompItem)) collectTextLayersFromComp(L.source, out, visited);
        }
    }

    // --- include text inside selected precomps (recursively). Fallback: active comp only.
    function getTargetTextLayers(comp){
        var out = [];
        var i;
        var sel = (comp && comp.selectedLayers) ? comp.selectedLayers : [];
        if (sel && sel.length > 0) {
            var visited = {};
            for (i = 0; i < sel.length; i++) {
                var L = sel[i];
                if (L.matchName === "ADBE Text Layer") out[out.length] = L;
                if (L.source && (L.source instanceof CompItem)) collectTextLayersFromComp(L.source, out, visited);
            }
            return out;
        }
        for (i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (layer.matchName === "ADBE Text Layer") out[out.length] = layer;
        }
        return out;
    }

    // Pull assistant "content" string and correctly unescape sequences (fixes stray 'n')
    function extractContentFromBody(body){
        if (!body) return "";
        var key = '"content"';
        var i = body.indexOf(key);
        if (i < 0) return "";
        var colon = body.indexOf(":", i);
        if (colon < 0) return "";
        var q1 = body.indexOf('"', colon+1);
        if (q1 < 0) return "";

        var out = [];
        var p = q1 + 1;
        while (p < body.length) {
            var ch = body.charAt(p);

            // stop at the first unescaped quote
            if (ch === '"') {
                // count backslashes before it to see if it's escaped
                var bs = 0, q = p - 1;
                while (q >= 0 && body.charAt(q) === "\\") { bs++; q--; }
                if ((bs % 2) === 0) break; // not escaped → end of string
            }

            if (ch === "\\") {
                var nxt = (p + 1 < body.length) ? body.charAt(p + 1) : "";
                if (nxt === "n") { out[out.length] = "\n"; p += 2; continue; }
                if (nxt === "r") { out[out.length] = "\r"; p += 2; continue; }
                if (nxt === "t") { out[out.length] = "\t"; p += 2; continue; }
                if (nxt === '"' ) { out[out.length] = '"';  p += 2; continue; }
                if (nxt === "\\") { out[out.length] = "\\"; p += 2; continue; }
                // unknown escape → drop backslash, keep next char if present
                if (nxt) { out[out.length] = nxt; p += 2; continue; }
                p++; continue; // trailing backslash
            }

            out[out.length] = ch;
            p++;
        }

        var s = out.join("");
        // normalize line endings
        s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        return s;
    }

    function showTrialUpgradeDialog(reasonText){
        var dlg = new Window("dialog", "Cult Translator — Upgrade");
        dlg.orientation = "column";
        dlg.alignChildren = ["fill","top"];
        dlg.margins = 16;
        dlg.spacing = 10;

        var msg = dlg.add("statictext", undefined, "You’ve reached the limits of the free trial.", {multiline:true});
        msg.maximumSize.width = 380;

        var msg2 = dlg.add("statictext", undefined,
            reasonText || "To continue using Cult Translator without interruptions, choose a plan below.",
            {multiline:true}
        );
        msg2.maximumSize.width = 380;

        var groupPlans = dlg.add("group");
        groupPlans.orientation = "column";
        groupPlans.alignChildren = ["fill","top"];
        groupPlans.spacing = 6;

        // Yearly
        var yearlyGroup = groupPlans.add("group");
        yearlyGroup.orientation = "column";
        yearlyGroup.alignChildren = ["fill","top"];
        var yearlyTitle = yearlyGroup.add("statictext", undefined, "Yearly — Save 35% · US$59/year");
        try {
            yearlyTitle.graphics.font = ScriptUI.newFont(
                yearlyTitle.graphics.font.name,
                ScriptUI.FontStyle.BOLD,
                yearlyTitle.graphics.font.size
            );
        } catch(e){}
        yearlyGroup.add("statictext", undefined, "- Our most popular plan.");
        yearlyGroup.add("statictext", undefined, "- Full access to all features.");
        yearlyGroup.add("statictext", undefined, "- Ideal for studios, agencies and teams.");

        // Monthly
        var monthlyGroup = groupPlans.add("group");
        monthlyGroup.orientation = "column";
        monthlyGroup.alignChildren = ["fill","top"];
        var monthlyTitle = monthlyGroup.add("statictext", undefined, "Monthly — US$7.90/month");
        try {
            monthlyTitle.graphics.font = ScriptUI.newFont(
                monthlyTitle.graphics.font.name,
                ScriptUI.FontStyle.BOLD,
                monthlyTitle.graphics.font.size
            );
        } catch(e){}
        monthlyGroup.add("statictext", undefined, "- Full access to all features.");
        monthlyGroup.add("statictext", undefined, "- Flexible option for freelancers and small teams.");

        var buttons = dlg.add("group");
        buttons.orientation = "row";
        buttons.alignChildren = ["center","center"];
        buttons.spacing = 10;

        var btnYearly  = buttons.add("button", undefined, "Get Yearly");
        var btnMonthly = buttons.add("button", undefined, "Get Monthly");
        var btnClose   = buttons.add("button", undefined, "Close");

        var URL_YEARLY  = "https://buy.cultextensions.com/b/3cI28sds1d1B5VW3jg2VG04?utm_source=yearly";
        var URL_MONTHLY = "https://buy.cultextensions.com/b/fZuaEYew53r12JKaLI2VG03?utm_source=monthly";

        btnYearly.onClick = function(){
            openUrl(URL_YEARLY);
            dlg.close();
        };
        btnMonthly.onClick = function(){
            openUrl(URL_MONTHLY);
            dlg.close();
        };
        btnClose.onClick = function(){ dlg.close(); };

        dlg.center();
        dlg.show();
    }

    // Final production version: no debug files, no leftover logs.
    // layerCount = total number of text layers being translated in this run
    function callOpenAI(payloadJSON, licenseKey, docsBase, layerCount){
        var TMP = Folder.temp;
        var TS  = "" + (new Date().getTime());
        var base = (docsBase||"AE_GPT_UI") + "_" + TS + "_";

        var REQ  = new File(TMP.fsName + "/" + base + "req.json");
        var RES  = new File(TMP.fsName + "/" + base + "res.json");
        var HTTP = new File(TMP.fsName + "/" + base + "http.txt");

        // Write payload to temp file
        if (!writeTextFile(REQ, payloadJSON)) {
            alertIf("Failed to write temp file for payload.");
            return { http:"", body:"", reqPath:"", resPath:"", httpPath:"" };
        }

        var DEVICE_ID = getDeviceId();
        var LAYERS = (typeof layerCount === "number" && layerCount > 0) ? layerCount : 0;

        // Curl command — no inline echo, fully quote-safe
        var cmd = CURL + ' -4 --http1.1 --noproxy "*" -sS ' +
                  '--connect-timeout 10 --max-time 60 ' +
                  '--retry 2 --retry-delay 1 --retry-connrefused ' +
                  '-X POST ' +
                  '-H "x-license-key: ' + licenseKey + '" ' +
                  '-H "x-device-id: ' + DEVICE_ID + '" ' +
                  '-H "x-device-name: ' + DEVICE_ID + '" ' +
                  '-H "x-layer-count: ' + LAYERS + '" ' +
                  '-H "Content-Type: application/json" ' +
                  '--data-binary @"' + REQ.fsName + '" ' +
                  '-o "' + RES.fsName + '" ' +
                  '"' + PROXY_URL + '" ' +
                  '-w "%{http_code}" > "' + HTTP.fsName + '" 2>&1';

        run(cmd);

        var http = trim(readTextFile(HTTP));
        var body = readTextFile(RES);

        // Clean up immediately (no files left)
        try{ REQ.remove(); }catch(e){}
        try{ RES.remove(); }catch(e){}
        try{ HTTP.remove(); }catch(e){}

        return { http:http, body:body, reqPath:"", resPath:"", httpPath:"" };
    }

    // Build payload for a chunk of items with strong delimiters
    function buildPayloadForChunk(items, srcLang, tgtLang, context){
        var sys = "You are a precise translator and localizer. Translate from " + srcLang + " to " + tgtLang + ". " +
                  "Culturalize references naturally for the target locale (currency, idioms, places, sports, foods). " +
                  "Keep the same capitalization style. " +
                  "Output contract: for each item k, return EXACTLY:\n" +
                  "<<<#k>>>\n<translated text>\n<<<END>>>\n" +
                  "No extra commentary, no additional blocks.";

        var instr =
            "Translate the following " + items.length + " item(s)" +
            (context ? (" with this context: " + context) : "") +
            ". Use the exact block format. Begin numbering at 1.\n\n" +
            "Items:\n";

        var k;
        for (k=0;k<items.length;k++){
            instr += "[#" + (k+1) + "] " + items[k] + "\n";
        }

        var payload =
            '{' +
              '"model":"' + MODEL + '",' +
              '"messages":[' +
                '{"role":"system","content":"' + jsonEscape(sys)  + '"},' +
                '{"role":"user","content":"'   + jsonEscape(instr) + '"}' +
              ']' +
            '}';

        return payload;
    }

    // Parse assistantText into array of blocks using <<<#k>>> ... <<<END>>> (tolerant to variants)
    function parseDelimitedBlocks(assistantText, expectedCount){
        var s = assistantText || "";
        // standardize line endings
        s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        // normalize variants like <<<end>>>, spaced markers, missing spaces
        s = s.replace(/<<<\s*end\s*>>>/gi, "<<<END>>>")
             .replace(/<<<\s*#\s*(\d+)\s*>>>/gi, "<<<#$1>>>");

        var results = [];
        var pos = 0;
        var found = 0;

        while (found < expectedCount) {
            var startIdx = s.indexOf("<<<#", pos);
            if (startIdx < 0) break;

            var closeStart = s.indexOf(">>>", startIdx);
            if (closeStart < 0) break;

            var numStr = s.substring(startIdx + 4, closeStart);
            var k = parseInt(trim(numStr), 10);
            if (isNaN(k) || k < 1) { pos = closeStart + 3; continue; }

            var contentStart = closeStart + 3;
            if (s.charAt(contentStart) === '\n') contentStart++;

            // find END token (accept <<<END>>> or <<<END>> as a fallback)
            var endIdx = s.indexOf("<<<END>>>", contentStart);
            if (endIdx < 0) endIdx = s.indexOf("<<<END>>", contentStart);
            if (endIdx < 0) {
                // fallback: until next block or end
                var nextBlock = s.indexOf("<<<#", contentStart);
                endIdx = (nextBlock > -1) ? nextBlock : s.length;
            }

            var block = s.substring(contentStart, endIdx);
            block = trim(block.replace(/^\uFEFF/, ""));

            results[k-1] = block;

            pos = endIdx + "<<<END>>>".length;
            found++;
        }

        var i;
        for (i=0; i<expectedCount; i++){
            if (results[i] === undefined) results[i] = "";
        }
        return results;
    }

    // ---- build UI panel ----
    function buildUI(thisObj){
        var pal = (thisObj instanceof Panel) ? thisObj : new Window("palette", "Cult Translator", undefined, {resizeable:true});
        pal.orientation = "column";
        pal.alignChildren = ["fill","top"];
        pal.margins = 10; pal.spacing = 8;
        pal.preferredSize = [540, 220];

        var rowLang = pal.add("group"); rowLang.orientation = "row"; rowLang.alignChildren = ["fill","center"]; rowLang.spacing = 10;

        var colSrc = rowLang.add("group"); colSrc.orientation="column"; colSrc.alignChildren=["fill","top"];
        colSrc.add("statictext", undefined, "Source language:");
        var ddSrc = colSrc.add("dropdownlist", undefined, SRC_LANGS);
        var i; ddSrc.selection = 0;
        for (i=0;i<SRC_LANGS.length;i++){ if (SRC_LANGS[i] === "English") { ddSrc.selection = i; break; } }

        var colTgt = rowLang.add("group"); colTgt.orientation="column"; colTgt.alignChildren=["fill","top"];
        colTgt.add("statictext", undefined, "Target language:");
        var ddTgt = colTgt.add("dropdownlist", undefined, TGT_LANGS);
        ddTgt.selection = 0;
        for (i=0; i < TGT_LANGS.length; i++){ if (TGT_LANGS[i] === "Spanish (Spain)") { ddTgt.selection = i; break; } }

        // --- Context row: placeholder INSIDE the box, full width ---
        var rowCtx = pal.add("group");
        rowCtx.orientation = "row";
        rowCtx.alignChildren = ["fill","center"];
        rowCtx.spacing = 10;

        var CONTEXT_PLACEHOLDER = "Context (optional)";
        var edCtx = rowCtx.add("edittext", undefined, CONTEXT_PLACEHOLDER);
        edCtx.alignment = ["fill","center"];
        edCtx.preferredSize = [0, 24];

        edCtx.addEventListener("focus", function(){ if (edCtx.text === CONTEXT_PLACEHOLDER) edCtx.text = ""; });
        edCtx.addEventListener("blur", function(){ if (!trim(edCtx.text)) edCtx.text = CONTEXT_PLACEHOLDER; });

        var btnRun = pal.add("button", undefined, "Translate");

        pal.onResizing = pal.onResize = function(){ this.layout.resize(); };

        btnRun.onClick = function(){
            var license = ensureLicense(); 
            if (!license) return;
            license = trim(license);

            if (DEBUG_SHOW_ONCE) {
                alertIf("Using license: [" + license + "]");
                alertIf(run(CURL + " -V"));
                DEBUG_SHOW_ONCE = false;
            }

            // Curl presence check (cross-platform)
            var cv = run(CURL + " -V");
            if (!cv || cv.toLowerCase().indexOf("curl") === -1) {
                var hint = IS_WIN
                    ? "I couldn't find curl on Windows. Ensure curl.exe is available (normally in C:\\Windows\\System32) or add it to PATH.\n"
                    : "I couldn't run /usr/bin/curl on macOS.\n";
                alertIf(hint + "Also ensure 'Allow Scripts to Write Files and Access Network' is enabled in Preferences.");
                return;
            }

            var comp = getActiveComp(); if (!comp) return;

            var layers = getTargetTextLayers(comp);
            if (layers.length === 0) { alertIf("No text layers found."); return; }

            var srcLang = ddSrc.selection ? ddSrc.selection.text : "English";
            var tgtLang = ddTgt.selection ? ddTgt.selection.text : "Spanish (Spain)";
            var ctxRaw  = edCtx.text || "";
            var ctx     = (ctxRaw === CONTEXT_PLACEHOLDER) ? "" : trim(ctxRaw);

            var texts = [];
            var ptrs  = [];
            var i2;

            for (i2=0;i2<layers.length;i2++){
                var L = layers[i2];
                var sp = getSourceTextProp(L); // universalized access
                if (!sp) continue;
                var doc = sp.value;
                var src = doc.text || "";

                if (src.length >= 4 && src.charAt(0)==='/' && src.charAt(1)==='*') {
                    var endC = src.indexOf("*/");
                    if (endC >= 0) src = src.substring(endC+2);
                }
                src = sanitize(src);
                if (!src) continue;

                texts[texts.length] = src;
                ptrs[ptrs.length]   = {layer:L, sp:sp, doc:doc};
            }

            if (texts.length === 0) { alertIf("All selected text layers are empty."); return; }

            // Total text layers to be translated in this run (sent to server for 100-layer trial cap)
            var totalLayerCount = texts.length;

            var MAX_ITEMS_PER_CALL = 8; // stability
            var updatedTotal = 0;

            app.beginUndoGroup("Translate ("+srcLang+" → "+tgtLang+")");

            var pos = 0;
            while (pos < texts.length) {
                var endIdx = Math.min(pos + MAX_ITEMS_PER_CALL, texts.length);

                var chunkItems = [];
                var chunkPtrs  = [];
                for (var c=pos; c<endIdx; c++){
                    chunkItems[chunkItems.length] = texts[c];
                    chunkPtrs[chunkPtrs.length]   = ptrs[c];
                }

                var payload = buildPayloadForChunk(chunkItems, srcLang, tgtLang, ctx);
                var resp = callOpenAI(payload, license, "AE_GPT_UI_BATCH", totalLayerCount);

                // Detect trial-specific errors (expired or layer cap) and show upgrade dialog
                var isTrialLimit = false;
                var isTrialExpired = false;
                if (resp && resp.http === "403") {
                    var lowerBody = (resp.body || "").toLowerCase();
                    if (lowerBody.indexOf("trial_limit_exceeded") !== -1) {
                        isTrialLimit = true;
                    } else if (lowerBody.indexOf("trial expired") !== -1) {
                        isTrialExpired = true;
                    }
                }

                if (isTrialLimit || isTrialExpired) {
                    app.endUndoGroup();
                    var reason;
                    if (isTrialLimit) {
                        reason = "The free trial is limited to 100 text layers per translation.\n\n" +
                                 "To keep using Cult Translator with larger compositions, choose a plan below.";
                    } else {
                        reason = "Your free trial has ended.\n\n" +
                                 "To continue enjoying Cult Translator in your daily workflow, choose a plan below.";
                    }
                    showTrialUpgradeDialog(reason);
                    return;
                }

                // proceed if HTTP is 200 OR the body clearly contains assistant content
                var hasAssistantContent = resp && resp.body && resp.body.indexOf('"content"') !== -1;
                if (resp.http !== "200" && !hasAssistantContent) {
                    alertIf("Proxy error on batch " + (pos+1) + "-" + endIdx + 
                            ": HTTP " + (resp.http||"(none)") + 
                            (resp.body ? ("\n\nBody:\n" + resp.body) : ""));
                    break;
                }

                var assistantText = extractContentFromBody(resp.body);
                if (!assistantText) assistantText = resp.body;

                var blocks = parseDelimitedBlocks(assistantText, chunkItems.length);

                for (var j=0;j<chunkPtrs.length;j++){
                    var translated = trim(blocks[j] || "");
                    // correct newline trimming (remove leading/trailing newlines only)
                    translated = translated.replace(/^\n+/, "").replace(/\n+$/, "");
                    // If upstream ever re-escapes, this is harmless:
                    translated = translated.replace(/\\n/g, "\n");
                    translated = trim(translated);

                    if (translated.length){
                        var p = chunkPtrs[j];
                        p.doc.text = translated;
                        p.sp.setValue(p.doc);
                        updatedTotal++;
                    }
                }

                pos = endIdx;
            }

            app.endUndoGroup();
            alertIf("Done. Updated " + updatedTotal + " text layer(s) via batched call(s).");
        };

        pal.layout.layout(true);
        if (pal instanceof Window) { pal.center(); pal.show(); }
        return pal;
    }

    buildUI(thisObj);
})(this);
