//@target aftereffects
(function CultTranslator_Main(thisObj){
    // ====== CLIENT CONFIG (website build: license embedded at download time) ======
    // The server will replace "LICENSE" with a real key for each customer.
    var LICENSE_KEY = "LICENSE";
    var PROXY_URL   = "https://ae-translate-proxy.onrender.com/translate";
    // Derive base server URL for feature checks & future endpoints
    var SERVER_BASE = (function(){
        var u = PROXY_URL || "";
        var idx = u.indexOf("/translate");
        if (idx >= 0) return u.substring(0, idx);
        return u.replace(/\/+$/,"");
    })();
    // ==================================

    // ---- constants ----
    var IS_WIN = ($.os && $.os.indexOf("Windows") === 0);
    var CURL   = IS_WIN ? "curl" : "/usr/bin/curl"; // or hardcode: "C:\\Windows\\System32\\curl.exe"
    var MODEL  = "gpt-4o-mini"; // you can change to "gpt-4o" if desired

    // Toggle to quickly see license/curl info once; leave false for production
    var DEBUG_SHOW_ONCE = false;

    // --- Master language list used by BOTH dropdowns (exactly 100) ---
    // (Now includes English (US) and English (UK))
    var LANGS_RAW =
"English|English (US)|English (UK)|Spanish|Spanish (Mexico)|Spanish (Spain)|Portuguese (Brazil)|Portuguese (Portugal)|French|German|Italian|Dutch|Russian|Ukrainian|Polish|Czech|Slovak|Hungarian|Romanian|Bulgarian|Greek|Turkish|Hebrew|Arabic (Standard)|Arabic (Egypt)|Arabic (Levant)|Persian (Farsi)|Dari|Pashto|Kurdish (Kurmanji)|Kurdish (Sorani)|Armenian|Georgian|Azerbaijani|Kazakh|Uzbek|Tajik|Mongolian|Chinese (Simplified)|Chinese (Traditional)|Cantonese|Japanese|Korean|Thai|Vietnamese|Indonesian|Malay|Filipino (Tagalog)|Lao|Khmer|Burmese|Sinhala|Nepali|Hindi|Urdu|Bengali|Punjabi (Gurmukhi)|Marathi|Gujarati|Tamil|Telugu|Kannada|Malayalam|Odia|Swahili|Amharic|Somali|Oromo|Yoruba|Igbo|Hausa|Wolof|Kinyarwanda|Shona|Zulu|Xhosa|Afrikaans|Malagasy|Quechua|Aymara|Guarani|Nahuatl (Central)|K’iche’|Haitian Creole|Jamaican Patois|Papiamento|Galician|Catalan|Basque|Swedish|Danish|Norwegian (Bokmål)|Finnish|Estonian|Latvian|Lithuanian|Icelandic|Slovenian|Croatian|Serbian|Macedonian|Albanian";

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

    // --- LICENSE: website build uses embedded LICENSE_KEY only ---
    function ensureLicense(){
        var k = trim(LICENSE_KEY || "");
        if (!k || k === "LICENSE") {
            alertIf(
                "Missing license.\n\n" +
                "Please re-download Cult Translator from your personalized link " +
                "and reinstall via:\n\n" +
                "File → Scripts → Install ScriptUI Panel…"
            );
            return "";
        }
        return k;
    }

    // Silent peek (for UI color at startup) — no popups if missing
    function peekLicense(){
        var k = trim(LICENSE_KEY || "");
        if (!k || k === "LICENSE") return "";
        return k;
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

    // ---------- GLOSSARY STATE ----------
    var glossaryText         = "";   // raw CSV/text from file
    var glossaryPromptSuffix = "";   // injected into system prompt
    var glossaryLabel        = null; // UI statictext for "[+] Glossary" / "[-] Name..."
    var generateLabel        = null; // UI statictext for "Generate Glossary"
    var cachedIsPro          = null; // cached PRO status

    // ---- Glossary UI colors ----
    var GLOSSARY_ACTIVE_COLOR   = [0.30, 0.65, 1.00]; // blue-ish for PRO
    var GLOSSARY_INACTIVE_COLOR = [0.60, 0.60, 0.60]; // neutral gray for standard/trial

    function setGlossaryControlColor(ctrl, isActive) {
        if (!ctrl || !ctrl.graphics || !ctrl.graphics.newPen) return;
        var c = isActive ? GLOSSARY_ACTIVE_COLOR : GLOSSARY_INACTIVE_COLOR;
        try {
            var g = ctrl.graphics;
            var pen = g.newPen(g.PenType.SOLID_COLOR, c, 1);
            g.foregroundColor = pen;
            // Small nudge to refresh drawing
            ctrl.notify("onDraw");
        } catch (e) {
            // silently ignore if ScriptUI is picky
        }
    }

    function refreshGlossaryColors(isPro) {
        setGlossaryControlColor(glossaryLabel,   isPro);
        setGlossaryControlColor(generateLabel,   isPro);
    }

    // Max characters we'll allow before truncating the label
    var GLOSSARY_LABEL_MAX_CHARS = 10;

    function formatGlossaryDisplayName(fileName) {
        fileName = fileName || "Glossary";

        // If it fits, show the full name
        if (fileName.length <= GLOSSARY_LABEL_MAX_CHARS) {
            return fileName;
        }

        // Otherwise, truncate and end with "..."
        var visibleChars = GLOSSARY_LABEL_MAX_CHARS - 3; // space for "..."
        if (visibleChars < 1) visibleChars = 1;

        return fileName.substring(0, visibleChars) + "...";
    }

    function updateGlossaryPromptFromText(txt) {
        glossaryText = txt || "";
        if (!glossaryText) {
            glossaryPromptSuffix = "";
            return;
        }

        glossaryPromptSuffix =
            "You have access to a bilingual glossary in CSV format with columns Source,Target,Context. " +
            "You MUST strictly follow this glossary: whenever a source term appears, use the exact target term " +
            "from the glossary, preserving casing and punctuation. Do NOT re-translate glossary terms.\n\n" +
            "Glossary (CSV):\n" + glossaryText;
    }

    // ---------- PRO CHECK (server-side) ----------
    function checkIsPro(licenseKey) {
        if (!licenseKey) return false;
        try {
            var url = SERVER_BASE + "/license/features";
            var TMP = Folder.temp;
            var f = new File(TMP.fsName + "/ct_features_" + (new Date().getTime()) + ".json");
            var cmd =
                CURL + ' -4 --http1.1 --noproxy "*" -sS ' +
                '-H "x-license-key: ' + licenseKey + '" ' +
                '"' + url + '" > "' + f.fsName + '"';
            run(cmd);
            var txt = readTextFile(f);
            try { f.remove(); } catch(e){}
            if (!txt) return false;
            if (txt.indexOf('"is_pro":true') !== -1 || txt.indexOf('"is_pro": true') !== -1) {
                return true;
            }
        } catch (e) {}
        return false;
    }

    function ensureProStatus(licenseKey) {
        if (cachedIsPro === null) {
            cachedIsPro = checkIsPro(licenseKey);
        }
        return cachedIsPro;
    }

    // ---------- PRO Upsell Dialog ----------
    function showProUpgradeDialog(featureName) {
        var dlg = new Window("dialog", "Cult Translator — PRO");
        dlg.orientation = "column";
        dlg.alignChildren = ["fill","top"];
        dlg.margins = 16;
        dlg.spacing = 10;

        var topBar = dlg.add("group");
        topBar.orientation = "row";
        topBar.alignChildren = ["right","top"];
        topBar.alignment = ["fill","top"];

        var filler = topBar.add("statictext", undefined, "");
        filler.alignment = ["fill","top"];

        var btnCloseX = topBar.add("button", undefined, "✕");
        btnCloseX.preferredSize = [20,20];
        btnCloseX.onClick = function(){ dlg.close(); };

        var title = dlg.add("statictext", undefined, "Unlock PRO features", {multiline:true});
        title.maximumSize.width = 380;

        var msgText =
            "You tried to use a PRO-only feature" +
            (featureName ? (": " + featureName) : "") + ".\n\n" +
            "Cult Translator PRO includes:\n" +
            "• Glossary import (CSV)\n" +
            "• Automatic glossary generation\n" +
            "• Consistent brand terminology across projects.";

        var msg = dlg.add("statictext", undefined, msgText, {multiline:true});
        msg.maximumSize.width = 380;

        var groupPlans = dlg.add("group");
        groupPlans.orientation = "column";
        groupPlans.alignChildren = ["fill","top"];
        groupPlans.spacing = 8;

        var yearlyPanel = groupPlans.add("panel", undefined, "");
        yearlyPanel.orientation = "column";
        yearlyPanel.alignChildren = ["fill","top"];
        yearlyPanel.margins = 8;
        yearlyPanel.spacing = 4;

        var yearlyHeader = yearlyPanel.add("group");
        yearlyHeader.orientation = "row";
        yearlyHeader.alignChildren = ["left","center"];
        var yearlyLabel = yearlyHeader.add("statictext", undefined, "Yearly PRO");
        try {
            yearlyLabel.graphics.font = ScriptUI.newFont(
                yearlyLabel.graphics.font.name,
                ScriptUI.FontStyle.BOLD,
                yearlyLabel.graphics.font.size
            );
        } catch(e){}
        yearlyHeader.add("statictext", undefined, " — US$99/yr");

        yearlyPanel.add("statictext", undefined, "- Best value for studios and agencies.");
        yearlyPanel.add("statictext", undefined, "- Unlock all glossary tools.");

        var monthlyPanel = groupPlans.add("panel", undefined, "");
        monthlyPanel.orientation = "column";
        monthlyPanel.alignChildren = ["fill","top"];
        monthlyPanel.margins = 8;
        monthlyPanel.spacing = 4;

        var monthlyHeader = monthlyPanel.add("group");
        monthlyHeader.orientation = "row";
        monthlyHeader.alignChildren = ["left","center"];
        var monthlyLabel = monthlyHeader.add("statictext", undefined, "Monthly PRO");
        try {
            monthlyLabel.graphics.font = ScriptUI.newFont(
                monthlyLabel.graphics.font.name,
                ScriptUI.FontStyle.BOLD,
                monthlyLabel.graphics.font.size
            );
        } catch(e){}
        monthlyHeader.add("statictext", undefined, " — US$12.90/mo");

        monthlyPanel.add("statictext", undefined, "- Flexible for freelancers and small teams.");

        var buttons = dlg.add("group");
        buttons.orientation = "row";
        buttons.alignChildren = ["center","center"];
        buttons.alignment = ["center","top"];
        buttons.spacing = 10;

        var btnYearly  = buttons.add("button", undefined, "Get Yearly PRO");
        var btnMonthly = buttons.add("button", undefined, "Get Monthly PRO");

        btnYearly.preferredSize  = [150, 28];
        btnMonthly.preferredSize = [150, 28];

        try {
            var g = btnYearly.graphics;
            var bluePen = g.newPen(g.PenType.SOLID_COLOR, [0.2, 0.6, 1.0, 1], 1);
            g.foregroundColor = bluePen;
        } catch(e){}

        // Updated to your actual PRO links
        var URL_PRO_YEARLY  = "https://buy.cultextensions.com/b/3cI8wQ87H9PpgAAcTQ2VG05?utm_source=yearly-pro";
        var URL_PRO_MONTHLY = "https://buy.cultextensions.com/b/5kQ00k3Rr3r1844f1Y2VG06?utm_source=monthly-pro";

        btnYearly.onClick = function(){
            openUrl(URL_PRO_YEARLY);
            dlg.close();
        };
        btnMonthly.onClick = function(){
            openUrl(URL_PRO_MONTHLY);
            dlg.close();
        };

        dlg.center();
        dlg.show();
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

    // === TRIAL UPGRADE DIALOG (unchanged) ===
    function showTrialUpgradeDialog(reasonText){
        var dlg = new Window("dialog", "Cult Translator — Upgrade");
        dlg.orientation = "column";
        dlg.alignChildren = ["fill","top"];
        dlg.margins = 16;
        dlg.spacing = 10;

        var topBar = dlg.add("group");
        topBar.orientation = "row";
        topBar.alignChildren = ["right","top"];
        topBar.alignment = ["fill","top"];
        topBar.margins = 0;

        var filler = topBar.add("statictext", undefined, "");
        filler.alignment = ["fill","top"];

        var btnCloseX = topBar.add("button", undefined, "✕");
        btnCloseX.preferredSize = [20, 20];
        btnCloseX.alignment = ["right","top"];
        btnCloseX.onClick = function(){ dlg.close(); };

        var msg = dlg.add("statictext", undefined, "You’ve reached the limits of the free trial.", {multiline:true});
        msg.maximumSize.width = 380;

        var msg2 = dlg.add("statictext", undefined,
            reasonText || "To keep using Cult Translator in your daily workflow, choose a plan below.",
            {multiline:true}
        );
        msg2.maximumSize.width = 380;

        var groupPlans = dlg.add("group");
        groupPlans.orientation = "column";
        groupPlans.alignChildren = ["fill","top"];
        groupPlans.spacing = 10;

        // Yearly plan block
        var yearlyPanel = groupPlans.add("panel", undefined, "");
        yearlyPanel.orientation = "column";
        yearlyPanel.alignChildren = ["fill","top"];
        yearlyPanel.margins = 8;
        yearlyPanel.spacing = 4;

        var yearlyHeader = yearlyPanel.add("group");
        yearlyHeader.orientation = "row";
        yearlyHeader.alignChildren = ["left","center"];
        var yearlyLabel = yearlyHeader.add("statictext", undefined, "Yearly");
        try {
            yearlyLabel.graphics.font = ScriptUI.newFont(
                yearlyLabel.graphics.font.name,
                ScriptUI.FontStyle.BOLD,
                yearlyLabel.graphics.font.size
            );
        } catch(e){}
        yearlyHeader.add("statictext", undefined, " — Save 35% · US$59/yr");

        yearlyPanel.add("statictext", undefined, "- Our most popular plan.");
        yearlyPanel.add("statictext", undefined, "- Full access to all features.");
        yearlyPanel.add("statictext", undefined, "- Ideal for studios, agencies and teams.");

        // Monthly plan block
        var monthlyPanel = groupPlans.add("panel", undefined, "");
        monthlyPanel.orientation = "column";
        monthlyPanel.alignChildren = ["fill","top"];
        monthlyPanel.margins = 8;
        monthlyPanel.spacing = 4;

        var monthlyHeader = monthlyPanel.add("group");
        monthlyHeader.orientation = "row";
        monthlyHeader.alignChildren = ["left","center"];
        var monthlyLabel = monthlyHeader.add("statictext", undefined, "Monthly");
        try {
            monthlyLabel.graphics.font = ScriptUI.newFont(
                monthlyLabel.graphics.font.name,
                ScriptUI.FontStyle.BOLD,
                monthlyLabel.graphics.font.size
            );
        } catch(e){}
        monthlyHeader.add("statictext", undefined, " — US$7.90/mo");

        monthlyPanel.add("statictext", undefined, "- Full access to all features.");
        monthlyPanel.add("statictext", undefined, "- Flexible option for freelancers and small teams.");

        // Buttons
        var buttons = dlg.add("group");
        buttons.orientation = "row";
        buttons.alignChildren = ["center","center"];
        buttons.alignment = ["center","top"];
        buttons.spacing = 10;

        var btnYearly  = buttons.add("button", undefined, "Get Yearly");
        var btnMonthly = buttons.add("button", undefined, "Get Monthly");

        btnYearly.preferredSize  = [130, 28];
        btnMonthly.preferredSize = [130, 28];

        try {
            var g = btnYearly.graphics;
            var bluePen = g.newPen(g.PenType.SOLID_COLOR, [0.2, 0.6, 1.0, 1], 1);
            g.foregroundColor = bluePen;
        } catch(e){}

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

    // === FIXED: buildPayloadForChunk now explicitly instructs <<<#k>>> ... <<<END>>> blocks ===
    function buildPayloadForChunk(items, srcLang, tgtLang, context){
        var sys = "You are a precise translator and localizer. Translate from " + srcLang + " to " + tgtLang + ". " +
                  "Culturalize references naturally for the target locale (currency, idioms, places, sports, foods). " +
                  "Keep the same capitalization style.";

        if (glossaryPromptSuffix && glossaryPromptSuffix.length) {
            sys += "\n\n" + glossaryPromptSuffix;
        }

        var instr =
            "You will receive " + items.length + " text item(s), each marked as [#k].\n" +
            "For EACH item k, you MUST output ONLY ONE block using this exact format:\n\n" +
            "<<<#k>>>\n" +
            "TRANSLATION OF ITEM k\n" +
            "<<<END>>>\n\n" +
            "Rules:\n" +
            "- One block per item, in order from 1 to " + items.length + ".\n" +
            "- Do NOT add any text before the first block or after the last block.\n" +
            "- Do NOT add explanations or numbering outside the <<<#k>>> markers.\n";

        if (context && context.length) {
            instr += "\nAdditional context you MUST respect:\n" + context + "\n";
        }

        instr += "\nItems:\n";

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
              '],' +
              '"temperature":0.2' +
            '}';

        return payload;
    }

    // Build payload for glossary GENERATION
    function buildPayloadForGlossary(textSamples, srcLang, tgtLang, notes){
        var sys =
            "You are a professional localization terminologist. " +
            "Your task is to extract or propose a bilingual terminology glossary for UI and motion graphics.\n\n" +
            "Output ONLY CSV text with columns: Source,Target,Context (in English). " +
            "No explanations, no markdown fences. One term per row. " +
            "Source = original phrase in " + srcLang + ". " +
            "Target = best translation in " + tgtLang + " (or leave blank if not applicable). " +
            "Context = short note about usage, tone or constraints.";

        var instr = "Based on the following text samples, create a multilingual glossary.\n";
        instr += "Focus on:\n";
        instr += "- Brand names\n";
        instr += "- Product names\n";
        instr += "- Calls to action (CTAs)\n";
        instr += "- Recurrent phrases that must stay consistent\n\n";
        if (notes && notes.length) {
            instr += "Additional notes from the user about the glossary:\n" + notes + "\n\n";
        }
        instr += "TEXT SAMPLES:\n\n";

        var i;
        for (i=0;i<textSamples.length;i++){
            instr += "- " + textSamples[i] + "\n";
        }

        var payload =
            '{' +
              '"model":"' + MODEL + '",' +
              '"messages":[' +
                '{"role":"system","content":"' + jsonEscape(sys)  + '"},' +
                '{"role":"user","content":"'   + jsonEscape(instr) + '"}' +
              '],' +
              '"temperature":0.2' +
            '}';

        return payload;
    }

    // Parse assistantText into array of blocks using <<<#k>>> ... <<<END>>> (tolerant to variants)
    function parseDelimitedBlocks(assistantText, expectedCount){
        var s = assistantText || "";
        s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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

            var endIdx = s.indexOf("<<<END>>>", contentStart);
            if (endIdx < 0) endIdx = s.indexOf("<<<END>>", contentStart);
            if (endIdx < 0) {
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

    // Helper: get extension from file name
    function getFileExtension(fileName) {
        if (!fileName) return "";
        var dot = fileName.lastIndexOf(".");
        if (dot < 0) return "";
        return fileName.substring(dot).toLowerCase();
    }

    // Escape a single CSV field (handle commas, quotes, newlines)
    function csvEscape(field) {
        if (field === null || field === undefined) field = "";
        field = "" + field;

        // Escape quotes
        if (field.indexOf('"') !== -1) {
            field = field.replace(/"/g, '""');
        }

        // If it contains comma, quote or newline, wrap in quotes
        if (field.indexOf(",") !== -1 ||
            field.indexOf('"') !== -1 ||
            field.indexOf("\n") !== -1 ||
            field.indexOf("\r") !== -1) {
            return '"' + field + '"';
        }

        return field;
    }

    // ------- Glossary File Handling -------
    function handleGlossaryImport(licenseKey) {
        var f = File.openDialog(
            "Select glossary file.",
            "*.*"
        );
        if (!f) return;

        // Only accept extensions GPT can reliably read via plain text on this client
        var ext = getFileExtension(f.name);
        var supported = { ".csv":1, ".tsv":1, ".txt":1 };
        if (!supported[ext]) {
            alertIf(
                "This file type is not supported for glossaries.\n\n" +
                "Supported file types are:\n" +
                "• .csv  — Comma-Separated Values\n" +
                "• .tsv  — Tab-Separated Values\n" +
                "• .txt  — Plain text"
            );
            return;
        }

        var txt = readTextFile(f);
        if (!txt) {
            alertIf("Could not read glossary file.");
            return;
        }

        updateGlossaryPromptFromText(txt);

        if (glossaryLabel) {
            glossaryLabel.text = "[-] " + formatGlossaryDisplayName(f.name);
        }
        alertIf("Glossary loaded.\nIt will now be applied to all translations for this license.");
    }

    function handleGlossaryRemove() {
        updateGlossaryPromptFromText("");
        if (glossaryLabel) {
            glossaryLabel.text = "[+] Glossary";
        }
        alertIf("Glossary removed.\nTranslations will no longer enforce glossary terms.");
    }

    // ------- Glossary Generator -------
    function collectSampleTextsFromComps(comps, maxItems) {
        var texts = [];
        var seen = {};
        var i, j;

        if (!maxItems || maxItems <= 0) maxItems = 200;

        for (i=0;i<comps.length;i++){
            var comp = comps[i];
            var layers = [];
            collectTextLayersFromComp(comp, layers, {});

            for (j=0;j<layers.length;j++){
                var L = layers[j];
                var sp = getSourceTextProp(L);
                if (!sp) continue;
                var doc = sp.value;
                var src = doc.text || "";

                if (src.length >= 4 && src.charAt(0)==='/' && src.charAt(1)==='*') {
                    var endC = src.indexOf("*/");
                    if (endC >= 0) src = src.substring(endC+2);
                }
                src = trim(sanitize(src));
                if (!src) continue;

                if (!seen[src]) {
                    texts[texts.length] = src;
                    seen[src] = 1;
                }

                if (texts.length >= maxItems) return texts;
            }
        }
        return texts;
    }

    function sanitizeCsvBody(raw, srcLang, tgtLang) {
        var s = raw || "";
        s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        // Remove fenced code blocks if present
        s = s.replace(/```csv/gi, "");
        s = s.replace(/```/g, "");

        s = trim(s);

        var lines = s.split(/\n/);
        var dataRows = [];
        var i;

        for (i = 0; i < lines.length; i++) {
            var line = trim(lines[i]);
            if (!line) continue;

            // Skip any header the model might have created
            if (i === 0 &&
                /source/i.test(line) &&
                /target/i.test(line)) {
                continue;
            }

            dataRows[dataRows.length] = line;
        }

        // 🟦 NEW: only one language column (Target) + Context
        var headerTgt = tgtLang || "Target";
        var header =
            csvEscape(headerTgt) + "," +
            csvEscape("Context");

        var outLines = [header];

        // Rebuild each row as exactly: Target,Context
        for (i = 0; i < dataRows.length; i++) {
            var parts = dataRows[i].split(",");
            var src = "";
            var tgt = "";
            var ctx = "";

            if (parts.length === 1) {
                // If the model only returned one column, treat it as the *term* in the target language
                tgt = trim(parts[0]);
            } else if (parts.length === 2) {
                // term + context OR source + target (we assume 2nd is best term)
                src = trim(parts[0]);
                tgt = trim(parts[1]);
            } else if (parts.length >= 3) {
                // source,target,context (or similar)
                src = trim(parts[0]);
                tgt = trim(parts[1]);
                // Everything after the second comma belongs to Context
                ctx = trim(parts.slice(2).join(","));
            }

            // Fallback: if tgt is empty, use src so we never lose the term
            if (!tgt && src) tgt = src;

            outLines[outLines.length] =
                csvEscape(tgt) + "," +
                csvEscape(ctx);
        }

        return outLines.join("\n");
    }

    function generateGlossaryFromComps(licenseKey, srcLang, tgtLang, notes, comps) {
        if (!comps || !comps.length) {
            alertIf("Select at least one composition.");
            return;
        }

        var samples = collectSampleTextsFromComps(comps, 200);
        if (!samples.length) {
            alertIf("No text layers found in the selected compositions.");
            return;
        }

        var payload = buildPayloadForGlossary(samples, srcLang, tgtLang, notes);
        var resp = callOpenAI(payload, licenseKey, "AE_GPT_GLOSSARY", 0);

        var hasAssistantContent = resp && resp.body && resp.body.indexOf('"content"') !== -1;
        if (resp.http !== "200" && !hasAssistantContent) {
            alertIf("Error while generating glossary.\nHTTP " + (resp.http||"(none)") +
                    (resp.body ? ("\n\nBody:\n" + resp.body) : ""));
            return;
        }

        var assistantText = extractContentFromBody(resp.body);
        if (!assistantText) assistantText = resp.body || "";
        assistantText = sanitizeCsvBody(assistantText, srcLang, tgtLang);

        var outFile = File.saveDialog("Save glossary as CSV", "CSV:*.csv");
        if (!outFile) return;

        var fsName = outFile.fsName;
        if (!/\.csv$/i.test(fsName)) {
            fsName += ".csv";
            outFile = new File(fsName);
        }

        if (!writeTextFile(outFile, assistantText)) {
            alertIf("Could not write CSV file.");
            return;
        }

        alertIf("Glossary CSV saved:\n" + outFile.fsName + "\n\nYou can now load it via [+] Glossary.");
    }

    // ---- build UI panel ----
    function buildUI(thisObj){
        var pal = (thisObj instanceof Panel) ? thisObj : new Window("palette", "Cult Translator", undefined, {resizeable:true});
        pal.orientation = "column";
        pal.alignChildren = ["fill","top"];
        pal.margins = 10; pal.spacing = 8;
        pal.preferredSize = [540, 260];

        var rowLang = pal.add("group");
        rowLang.orientation = "row"; rowLang.alignChildren = ["fill","center"]; rowLang.spacing = 10;

        var colSrc = rowLang.add("group"); colSrc.orientation="column"; colSrc.alignChildren=["fill","top"];
        colSrc.add("statictext", undefined, "Source language:");
        var ddSrc = colSrc.add("dropdownlist", undefined, SRC_LANGS);
        var i; ddSrc.selection = 0;
        for (i=0;i<SRC_LANGS.length;i++){
            if (SRC_LANGS[i] === "English (US)") { ddSrc.selection = i; break; }
        }

        var colTgt = rowLang.add("group"); colTgt.orientation="column"; colTgt.alignChildren=["fill","top"];
        colTgt.add("statictext", undefined, "Target language:");
        var ddTgt = colTgt.add("dropdownlist", undefined, TGT_LANGS);
        ddTgt.selection = 0;
        for (i=0; i < TGT_LANGS.length; i++){
            if (TGT_LANGS[i] === "Spanish (Spain)") { ddTgt.selection = i; break; }
        }

        // --- Context row ---
        var rowCtx = pal.add("group");
        rowCtx.orientation = "row";
        rowCtx.alignChildren = ["fill","center"];
        rowCtx.spacing = 10;

        var CONTEXT_PLACEHOLDER = "Context (optional)";
        var edCtx = rowCtx.add("edittext", undefined, CONTEXT_PLACEHOLDER);
        edCtx.alignment = ["fill","center"];
        edCtx.preferredSize = [0, 24];

        edCtx.addEventListener("focus", function(){
            if (edCtx.text === CONTEXT_PLACEHOLDER) edCtx.text = "";
        });
        edCtx.addEventListener("blur", function(){
            if (!trim(edCtx.text)) edCtx.text = CONTEXT_PLACEHOLDER;
        });

        var btnRun = pal.add("button", undefined, "Translate");

        // --- Bottom row: Glossary + Generate Glossary ---
        var rowBottom = pal.add("group");
        rowBottom.orientation = "row";
        rowBottom.alignChildren = ["fill","center"];
        rowBottom.alignment = ["fill","bottom"];

        var leftGroup = rowBottom.add("group");
        leftGroup.orientation = "row";
        leftGroup.alignChildren = ["left","center"];
        leftGroup.alignment = ["left","center"];

        glossaryLabel = leftGroup.add("statictext", undefined, "[+] Glossary");

        var rightGroup = rowBottom.add("group");
        rightGroup.orientation = "row";
        rightGroup.alignChildren = ["right","center"];
        rightGroup.alignment = ["right","center"];

        generateLabel = rightGroup.add("statictext", undefined, "Generate Glossary");

        pal.onResizing = pal.onResize = function(){ this.layout.resize(); };

        // Initial UI: if license is PRO, show buttons in blue immediately
        var initialLicense = peekLicense();
        var initialIsPro = false;
        if (initialLicense) {
            initialIsPro = ensureProStatus(initialLicense);
        }
        refreshGlossaryColors(initialIsPro);

        // ---------- Translate button ----------
        btnRun.onClick = function(){
            var license = ensureLicense();
            if (!license) return;
            license = trim(license);

            // As soon as we know the license, update glossary colors for this session
            var isProNow = ensureProStatus(license);
            refreshGlossaryColors(isProNow);

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

            var srcLang = ddSrc.selection ? ddSrc.selection.text : "English (US)";
            var tgtLang = ddTgt.selection ? ddTgt.selection.text : "Spanish (Spain)";
            var ctxRaw  = edCtx.text || "";
            var ctx     = (ctxRaw === CONTEXT_PLACEHOLDER) ? "" : trim(ctxRaw);

            var texts = [];
            var ptrs  = [];
            var i2;

            for (i2=0;i2<layers.length;i2++){
                var L = layers[i2];
                var sp = getSourceTextProp(L);
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

            var totalLayerCount = texts.length;

            var MAX_ITEMS_PER_CALL = 8; // stability
            var updatedTotal = 0;

            app.beginUndoGroup("Translate ("+srcLang+" → "+tgtLang+")");

            var pos = 0;
            while (pos < texts.length) {
                var endIdx = Math.min(pos + MAX_ITEMS_PER_CALL, texts.length);

                var chunkItems = [];
                var chunkPtrs  = [];
                var c;
                for (c=pos; c<endIdx; c++){
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
                        reason = "The free trial is limited to 100 text layers in total.\n\n" +
                                 "To keep using Cult Translator for larger projects and ongoing work, choose a plan below.";
                    } else {
                        reason = "To continue enjoying Cult Translator in your daily workflow, choose a plan below.";
                    }
                    showTrialUpgradeDialog(reason);
                    return;
                }

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
                    translated = translated.replace(/^\n+/, "").replace(/\n+$/, "");
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

        // ---------- Glossary click ----------
        if (glossaryLabel && glossaryLabel.addEventListener) {
            glossaryLabel.addEventListener("click", function(){
                var license = ensureLicense();
                if (!license) return;
                license = trim(license);

                var isPro = ensureProStatus(license);
                refreshGlossaryColors(isPro);

                if (!isPro) {
                    showProUpgradeDialog("Glossary");
                    return;
                }

                // If no glossary loaded: import
                if (!glossaryText) {
                    handleGlossaryImport(license);
                } else {
                    // Ask to remove
                    var doRemove = confirm("Remove current glossary from this license?\n\nIt will no longer be applied to translations.");
                    if (doRemove) {
                        handleGlossaryRemove();
                    }
                }
            });
        }

        // ---------- Generate Glossary click ----------
        if (generateLabel && generateLabel.addEventListener) {
            generateLabel.addEventListener("click", function(){
                var license = ensureLicense();
                if (!license) return;
                license = trim(license);

                var isPro = ensureProStatus(license);
                refreshGlossaryColors(isPro);

                if (!isPro) {
                    showProUpgradeDialog("Glossary generator");
                    return;
                }

                if (!app.project || app.project.numItems < 1) {
                    alertIf("No project open.");
                    return;
                }

                var dlg = new Window("dialog", "Generate Glossary");
                dlg.orientation = "column";
                dlg.alignChildren = ["fill","top"];
                dlg.margins = 16;
                dlg.spacing = 10;
                dlg.preferredSize = [420, 420];

                dlg.add("statictext", undefined, "Select the reference compositions:", {multiline:false});

                var listGroup = dlg.add("group");
                listGroup.orientation = "column";
                listGroup.alignChildren = ["fill","fill"];
                listGroup.alignment = ["fill","fill"];

                var lb = listGroup.add("listbox", undefined, [], {multiselect:true});
                lb.alignment = ["fill","fill"];
                lb.preferredSize = [0, 220];

                var comps = [];
                var idx;
                for (idx = 1; idx <= app.project.numItems; idx++) {
                    var it = app.project.item(idx);
                    if (it instanceof CompItem) {
                        comps[comps.length] = it;
                        lb.add("item", it.name);
                        // 🛈 Store index on item for retrieval later
                        lb.items[lb.items.length-1].index = comps.length-1;
                    }
                }

                dlg.add("statictext", undefined, "Glossary notes (optional):", {multiline:false});
                var edNotes = dlg.add("edittext", undefined, "", {multiline:true});
                edNotes.preferredSize = [0, 80];
                edNotes.alignment = ["fill","top"];

                var btnRow = dlg.add("group");
                btnRow.orientation = "row";
                btnRow.alignChildren = ["center","center"];
                btnRow.alignment = ["center","bottom"];
                btnRow.spacing = 10;

                var btnExport = btnRow.add("button", undefined, "Export CSV");
                var btnCancel = btnRow.add("button", undefined, "Cancel");

                btnCancel.onClick = function(){ dlg.close(); };

                btnExport.onClick = function(){
                    var selection = lb.selection;
                    if (!selection || (selection.length && selection.length === 0)) {
                        alertIf("Select at least one composition.");
                        return;
                    }

                    var selectedComps = [];
                    var iSel;

                    if (selection instanceof Array || selection.length) {
                        for (iSel=0;iSel<selection.length;iSel++){
                            var item = selection[iSel];
                            var compIndex = item.index;
                            if (compIndex >= 0 && compIndex < comps.length) {
                                selectedComps[selectedComps.length] = comps[compIndex];
                            }
                        }
                    } else {
                        var singleIndex = selection.index;
                        if (singleIndex >= 0 && singleIndex < comps.length) {
                            selectedComps[selectedComps.length] = comps[singleIndex];
                        }
                    }

                    if (!selectedComps.length) {
                        alertIf("Select at least one composition.");
                        return;
                    }

                    var srcLang = ddSrc.selection ? ddSrc.selection.text : "English (US)";
                    var tgtLang = ddTgt.selection ? ddTgt.selection.text : "Spanish (Spain)";
                    var notes   = trim(edNotes.text||"");

                    dlg.close();
                    generateGlossaryFromComps(license, srcLang, tgtLang, notes, selectedComps);
                };

                dlg.center();
                dlg.show();
            });
        }

        pal.layout.layout(true);
        if (pal instanceof Window) { pal.center(); pal.show(); }
        return pal;
    }

    buildUI(thisObj);
})(this);
