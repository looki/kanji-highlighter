// ==UserScript==
// @name        Kanji Highlighter
// @namespace   japanese
// @description Highlights all kanji on a website using a specific color, depending on the 'level' that it can be found in (optimized for WaniKani users).
// @include     *
// @exclude     http*://mail.google.com*
// @exclude     http*://*reddit.com*
// @version     1.7.1.1
// @grant       GM_addStyle
// @grant       GM_registerMenuCommand
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_deleteValue
// @grant       GM_setClipboard
// @grant       GM_openInTab
// @require     http://ajax.googleapis.com/ajax/libs/jquery/1.10.2/jquery.min.js
// ==/UserScript==

// Visiblity coefficient for markup
var COL_ALPHA = 0.5;

// Number of color steps to generate for the unknown Kanji levels
var COLOR_STEPS = 5;

// Colors to use to generate color levels with
var COL_FROM = [255, 255, 128]; // yellow
var COL_TO = [255, 128, 128]; // red

// Special colors
var COL_KNOWN = "rgba(221, 255, 208, " + COL_ALPHA + ")";
var COL_CURRENT = "rgba(140, 255, 120, " + COL_ALPHA + ")";
var COL_ADDITIONAL = "rgba(208, 255, 255, " + COL_ALPHA + ")"; // User-added known kanji that have not been learned in one of the levels
var COL_SEEN = "rgba(255, 192, 255, " + COL_ALPHA + ")"; // User-added seen kanji
var COL_MISSING = "rgba(190, 190, 190, " + COL_ALPHA + ")";

// Matches a kanji in a string
var kanjiRegexp = /[\u4e00-\u9faf\u3400-\u4dbf]/;
// Matches all non-kanji characters
var notKanjiRegexp = /[^\u4e00-\u9faf\u3400-\u4dbf]+/g;

// Renderer setting mask bits
var R_KNOWN = 1;
var R_MISSING = 2;
var R_UNKNOWN = 4;
var R_ADD_K = 8;
var R_ADD_S = 16;
var R_CURRENT = 32;

// CSS that applies to all classes
var CSS_GLOBAL = "display:inline!important;margin:0!important;padding:0!important;border:0!important;"
                + "outline:0!important;font-size:100%!important;vertical-align:baseline!important;";

// Main
window.addEventListener("load", function (e) {
    // Register menu items
    GM_registerMenuCommand("Set current level", setKanjiLevel, "l");
    GM_registerMenuCommand("Show kanji statistics", countKanji);
    GM_registerMenuCommand("Re-scan website", rescanWebsite, "r");
    GM_registerMenuCommand("Open info for selected kanji", openKanjiDetails, "o");
    GM_registerMenuCommand("Set highlight settings", setRenderSettings);
    GM_registerMenuCommand("Temporarily disable on this site", undoHighlighting, "d");
    GM_registerMenuCommand("== Kanji from other sources:", function() { alert("Hey! I'm just a caption. Don't click me!"); });
    GM_registerMenuCommand("Set known", function() { setCustomKanji("known"); });
    GM_registerMenuCommand("Add known", function() { addCustomKanji("known"); }, "k");
    GM_registerMenuCommand("Remove known", function() { remCustomKanji("known"); });
    GM_registerMenuCommand("Set seen", function() { setCustomKanji("seen"); });
    GM_registerMenuCommand("Add seen", function() { addCustomKanji("seen"); }, "s");
    GM_registerMenuCommand("Remove seen", function() { remCustomKanji("seen"); });
    GM_registerMenuCommand("== Advanced:", function () { alert("Hey! I'm just a caption. Don't click me!"); });
    GM_registerMenuCommand("Set info website URLs", setInfoURLs);
    GM_registerMenuCommand("Modify level dictionary", setKanjiDict);
    GM_registerMenuCommand("Reset level dictionary", resetKanjiDict);
    GM_registerMenuCommand("Reset additionally known", function() { resetCustomKanji("known"); });
    GM_registerMenuCommand("Reset additionally seen", function() { resetCustomKanji("seen"); });
    GM_registerMenuCommand("Copy list of known kanji", copyKnownKanji);
    GM_registerMenuCommand("Copy list of unknown kanji", copyUnknownKanji);

    // GM_deleteValue("level");
    // GM_deleteValue("dictionary");

    loadSettings();
    rescanWebsite();
}, false);

// Register shortcut for setting the level
(function(){
document.addEventListener('keydown', function(e) {
    if (e.keyCode == 76 && !e.shiftKey && e.ctrlKey && e.altKey && !e.metaKey) {
        setKanjiLevel();
    }
}, false);
})();

// Register shortcut for opening the selected kanji on WK
(function(){
document.addEventListener('keydown', function(e) {
    if (e.keyCode == 79 && !e.shiftKey && e.ctrlKey && e.altKey && !e.metaKey) {
        openKanjiDetails();
    }
}, false);
})();

// Register shortcut for 'add additional known kanji'
(function(){
document.addEventListener('keydown', function(e) {
    if (e.keyCode == 75 && !e.shiftKey && e.ctrlKey && e.altKey && !e.metaKey) {
        addCustomKanji("known");
    }
}, false);
})();

// Register shortcut for 'add additional seen kanji'
(function(){
document.addEventListener('keydown', function(e) {
    if (e.keyCode == 83 && !e.shiftKey && e.ctrlKey && e.altKey && !e.metaKey) {
        addCustomKanji("seen");
    }
}, false);
})();

// Register shortcut for 're-scan website'
(function(){
document.addEventListener('keydown', function(e) {
    if (e.keyCode == 82 && !e.shiftKey && e.ctrlKey && e.altKey && !e.metaKey) {
        rescanWebsite();
    }
}, false);
})();

// Register shortcut for 'Temporarily disable highlighting'
(function(){
document.addEventListener('keydown', function(e) {
    if (e.keyCode == 68 && !e.shiftKey && e.ctrlKey && e.altKey && !e.metaKey) {
        undoHighlighting();
    }
}, false);
})();

function loadSettings() {
    // First time running the script
    if (GM_getValue("level") == null) {

        // Circumvent weird bug
        GM_setValue("level", 1);
        if (GM_getValue("level") == null)
            return;
        GM_deleteValue("level");

        alert("Since this is the first time that you're using the kanji highlighter script, " +
            "please adjust the following options to your needs.");
        setKanjiLevel();
    }

    // Load the dictionary - Wanikani's by default
    var dictionary;
    var dictValue = GM_getValue("dictionary");
    if (dictValue == null) {
        dictionary = getWKKanjiLevels();
        GM_setValue("dictionary", JSON.stringify(dictionary));
        GM_setValue("levelCount", dictionary.length);
    } else {
        dictionary = JSON.parse(dictValue);
    }
    if (GM_getValue("levelCount") == null && dictionary !== null)
        GM_setValue("levelCount", dictionary.length);
    unsafeWindow.dictionary = dictionary;

    // Legacy support
    if (old = GM_getValue("additionalKanji")) {
        GM_setValue("knownKanji", old);
        GM_deleteValue("additionalKanji");
    }

    // Store global values
    unsafeWindow.renderSettings = GM_getValue("renderSettings", 0xff);
    unsafeWindow.levelCount = GM_getValue("levelCount", getWKKanjiLevels().length); // TODO: Allow changing
    unsafeWindow.levelThreshold = GM_getValue("level", 1);
    unsafeWindow.knownKanji = GM_getValue("knownKanji", "");
    unsafeWindow.seenKanji = GM_getValue("seenKanji", "");
    unsafeWindow.infoPage = GM_getValue("infoPage", "https://www.wanikani.com/kanji/$K");
    unsafeWindow.infoFallback = GM_getValue("infoPage", "http://jisho.org/search/$K #kanji");
    unsafeWindow.dictionary = dictionary;

    // Build linear map
    unsafeWindow.kanjiMap = buildKanjiMap();

    // Generate CSS classes
    css = ".wk_K {  " + CSS_GLOBAL + " background-color: " + COL_KNOWN + " !important; /*color: black !important;*/ } ";
    css += ".wk_X { " + CSS_GLOBAL + " background-color: " + COL_MISSING + " !important; /*color: black !important;*/ } ";
    css += ".wk_A { " + CSS_GLOBAL + " background-color: " + COL_ADDITIONAL + " !important; /*color: black !important;*/ } ";
    css += ".wk_S { " + CSS_GLOBAL + " background-color: " + COL_SEEN + " !important; /*color: black !important;*/ } ";
    css += ".wk_C { " + CSS_GLOBAL + " background-color: " + COL_CURRENT + " !important; /*color: black !important;*/ } ";
    // Now generate a rainbow for the unknown levels
    for (i = 0; i < COLOR_STEPS; ++i) {
        ii = i * 1.0 / (COLOR_STEPS - 1);
        r = COL_FROM[0] * (1 - ii) + COL_TO[0] * ii;
        g = COL_FROM[1] * (1 - ii) + COL_TO[1] * ii;
        b = COL_FROM[2] * (1 - ii) + COL_TO[2] * ii;

        bgCol = 'rgba(' + Math.floor(r) + ',' + Math.floor(g) + ', ' + Math.floor(b) + ', ' + COL_ALPHA + ')';
        css += ".wk_" + i + " { " + CSS_GLOBAL + " /*color: black;*/ background-color: " + bgCol + " !important; } ";
    }
    GM_addStyle(css);
}

/*
 * Set render settings
 */
function setRenderSettings() {
    var t = "Enter 1 if you want to highlight ";
    var tmp, result = 0;
    var render = GM_getValue("renderSettings", unsafeWindow.renderSettings);
    do {
        if (null === (tmp = window.prompt(t + "officially learned (green) kanji, or 0 otherwise.", (render & R_KNOWN) ? 1 : 0)))
            break;
        if (tmp > 0)
            result |= R_KNOWN;

        if (null === (tmp = window.prompt(t + "new kanji from the current level (darker green), or 0 otherwise.", (render & R_CURRENT) ? 1 : 0)))
            break;
        if (tmp > 0)
            result |= R_CURRENT;

        if (null === (tmp = window.prompt(t + "not yet officially learned (yellow - red) kanji, or 0 otherwise.", (render & R_UNKNOWN) ? 1 : 0)))
            break;
        if (tmp > 0)
            result |= R_UNKNOWN;

        if (null === (tmp = window.prompt(t + "kanji not present in the levels (black), or 0 otherwise.", (render & R_MISSING) ? 1 : 0)))
            break;
        if (tmp > 0)
            result |= R_MISSING;

        if (null === (tmp = window.prompt(t + "additionally known (blue) kanji, or 0 otherwise.", (render & R_ADD_K) ? 1 : 0)))
            break;
        if (tmp > 0)
            result |= R_ADD_K;

        if (null === (tmp = window.prompt(t + "additionally seen (purple) kanji, or 0 otherwise.", (render & R_ADD_S) ? 1 : 0)))
            break;
        if (tmp > 0)
            result |= R_ADD_S;

        alert("You need to refresh the page in order to see the changes.");
        GM_setValue("renderSettings", result);
    } while (0);
}

/* 
 * Specifies the URLs to use when opening kanji detail pages.
 */
function setInfoURLs() {
    var infoPage, infoFallback;
    if (infoPage = window.prompt("Enter the URL to use when opening a kanji detail page " 
        + "($K will be replaced with the kanji).", unsafeWindow.infoPage)) {
        unsafeWindow.infoPage = infoPage;

        if (infoPage = window.prompt("Enter the URL to use as a fallback for unavailable kanji "
            + "($K will be replaced with the kanji).", unsafeWindow.infoFallback)) {
            unsafeWindow.infoFallback = infoFallback;
        }
    }
}

/*
 * Counts all the kanji and displays them in a popup.
 */
function countKanji() {
    currentLevel = unsafeWindow.levelThreshold;
    kanjiMap = buildKanjiMap();
    var known = 0, unknown = 0, additional = 0, formallyknown = 0, seen = 0;
    for (var kanji in kanjiMap) {
        level = kanjiMap[kanji];
        if (level <= currentLevel && level >= -1)
            known++;
        else if (level == -2)
            seen++;
        else
            unknown++;
        if (level == -1)
            additional++;
        else if (level <= currentLevel)
            formallyknown++;
    }
    alert((formallyknown) + " kanji have already been learned. There are " + additional +
        " additionally known kanji. The number of known kanji in total is " + known + ", plus " + seen + " marked as seen.");
}

/*
 * Removes the CSS decoration generated by the script, just this once. Useful for viewing Chinese pages
 * or just pages dealing with many kanji in general.
 */
function undoHighlighting() {
    $('span[class^=wk_]').removeClass();
}

/*
 * Prompts a dialog that allows the user to change his current threshold level
 */
function setKanjiLevel() {
    var level = window.prompt("Please enter the highest kanji level that should be marked as 'known'.", GM_getValue("level", 1));
    if (level !== null) {
        level = Math.max(1, Math.min(GM_getValue("levelCount", 1), parseInt(level, 10)));
        GM_setValue("level", level);
    }
}

/*
 * Prompts a dialog that allows the user to edit the raw kanji dictionary
 */
function setKanjiDict() {
    var kanjiDict = "";
    GM_setClipboard(JSON.stringify(unsafeWindow.dictionary, null, 4));
    alert("The dictionary has been copied into your clipboard. You should modify it using a text editor. "+
        "Once you're done, paste it into the text field in the next dialog.");

    // Try until proper JSON was specified
    while (true) {
        kanjiDict = window.prompt("Paste the new dictionary here.", kanjiDict);

        // Abort if nothing entiered
        if (kanjiDict == null)
            break;

        try {
            dict = JSON.parse(kanjiDict);
            if (dict instanceof Object) {
                // Find highest level
                var levelCount = Object.keys(dict).length;

                // Update & finish
                GM_setValue("levelCount", levelCount);
                GM_setValue("dictionary", kanjiDict);
                alert("Dictionary updated successfully - " + levelCount + " levels detected.");
                return;
            } else
                alert("The specified JSON is not a dictionary!");
        } catch (e) {
            if (e instanceof SyntaxError)
                alert("Error while parsing: " + e.message);
            else
                alert("Error: " + e.message);
        }
    }
}

/*
 * Opens a kanji detail website for every kanji in the selected phrase.
 * Uses a fallback website for kanji that are not within the levels
 * Defaults: WaniKani + beta.jisho.org as fallback.
 */
function openKanjiDetails() {
    var kanjiMap = unsafeWindow.kanjiMap;
    var kanji = getKanjiInString(getSelection().toString());
    var infoPage = unsafeWindow.infoPage;
    var infoFallback = unsafeWindow.infoFallback;

    for (var i = 0; i < kanji.length; ++i) {
        if (kanjiMap[kanji[i]] >= 1)
            GM_openInTab(infoPage.replace("$K", kanji[i]));
        else
            GM_openInTab(infoFallback.replace("$K", kanji[i]));
    }
}

/*
 * Opens a dialog to confirm that the dictionary should be reset to its default value
 */
function resetKanjiDict() {
    if (window.prompt("You are about to reset your level dictionary. If you have modified it on your own, "
        + "all changes will be lost. Enter 'yes' to confirm.", "") == "yes")
    {
        var wk = getWKKanjiLevels();
        GM_setValue("dictionary", JSON.stringify(wk));
        GM_setValue("levelCount", wk.length);
    }
}

/*
 * Prompts a dialog that allows the user to change his set of additional known/seen kanji from other sources
 */
function setCustomKanji(mode) {
    var kanji = window.prompt("Please enter a list of kanji that should always be regarded as '" + mode + "'. " +
        "You may insert an entire text - all non-kanji characters will automatically be removed.", GM_getValue(mode + "Kanji", ""));
    if (kanji !== null) {
        kanji = getKanjiInString(kanji);
        GM_setValue(mode + "Kanji", kanji);
    }
}

/*
 * Prompts a dialog that allows the user to add new manually known/seen kanji
 */
function addCustomKanji(mode) {
    var kanji = window.prompt("Please enter the kanji that you want to add as '" + mode + "'. " +
        "You may insert an entire text - all non-kanji characters will automatically be removed.",
        getKanjiInString(window.getSelection().toString()));
    if (kanji !== null) {
        kanji =getKanjiInString(GM_getValue(mode + "Kanji", "") + kanji);
        GM_setValue(mode + "Kanji", kanji);
    }
}

/*
 * Prompts a dialog that allows the user to remove manually known/seen kanji
 */
function remCustomKanji(mode) {
    var kanji = window.prompt("Please enter the kanji that you want to remove from the '" + mode + "' list. " +
        "You may insert an entire text - all non-kanji characters will automatically be removed.",
        getKanjiInString(window.getSelection().toString()));
    if (kanji !== null) {
        filter = new RegExp("[" + kanji + "]");
        kanji = getKanjiInString(GM_getValue(mode + "Kanji", "").replace(filter, ""));
        GM_setValue(mode + "Kanji", kanji);
    }
}

/*
 * Removes all kanji from the additionally known/seen list 
 */
function resetCustomKanji(mode) {
    if (window.prompt("You are about to reset list of additional " + mode + "kanji. "
        + "All changes will be lost. Enter 'yes' to confirm.", "") == "yes") {
        GM_setValue(mode + "Kanji", "");
    }
}


/*
 * (Re-)highlight all elements, ignoring already highlighted elements
 */
var scannedBefore = false;
function rescanWebsite() {
    // ':not([class^=wk_])' will filter out already highlighted kanji for when we want to update dynamically loaded content
    if (!scannedBefore) {
        highlightKanji("body *:not(noscript):not(script):not(style):not(textarea):not([class^=wk_])");
        scannedBefore = true;
    } else {
        highlightKanji("body *:not(noscript):not(script):not(style):not(textarea)");
    }
}

/* 
 * Lets the user copy a list of each kanji marked as "known" (including additional ones)
 */
 function copyKnownKanji() {
    kanjiMap = unsafeWindow.kanjiMap;
    levelThreshold = unsafeWindow.levelThreshold;
    output = "";
    for (var key in kanjiMap) {
        if (kanjiMap[key] <= levelThreshold && kanjiMap[key] >= -1)
            output += key;
    }
    window.prompt("Press ctrl+C to copy this list. It includes all kanji up to the current level and those marked as known manually.", output);
 }

 /* 
 * Lets the user copy a list of each kanji not yet learned
 */
 function copyUnknownKanji() {
    kanjiMap = unsafeWindow.kanjiMap;
    levelThreshold = unsafeWindow.levelThreshold;
    output = "";
    for (var key in kanjiMap) {
        if (kanjiMap[key] > levelThreshold)
            output += key;
    }
    window.prompt("Press ctrl+C to copy this list. It includes all kanji that were not yet learned.", output);
 }

/*
 * Highlights all the Kanji within selector's elements
 */
function highlightKanji(selector) {
    // Retrieve global variables
    var kanjiMap = unsafeWindow.kanjiMap;
    var levelThreshold = unsafeWindow.levelThreshold;
    var levelCount = unsafeWindow.levelCount;
    var renderSettings = unsafeWindow.renderSettings;

    $(selector).forEachText(function (str) {
        var output = "";
        var previousClass = "";
        for (var i = 0; i < str.length; ++i) {
            var chr = str[i];

            // Not a kanji, just keep it the same
            if (kanjiRegexp.test(chr)) {
                var level = kanjiMap[chr];

                // Assume that Kanji is known
                var className = "";

                // Self-learned kanji
                if ((renderSettings & R_ADD_K) && level == -1)
                    className = "A";
                else if ((renderSettings & R_ADD_S) && level == -2)
                    className = "S";
                // Not in WaniKani, highlight as missing
                else if ((renderSettings & R_MISSING) && isNaN(level))
                    className = "X";
                // Kanji on the *current* level
                else if ((renderSettings & R_CURRENT) && level == levelThreshold)
                    className = "C";
                // Kanji known
                else if ((renderSettings & R_KNOWN) && level <= levelThreshold)
                    className = "K";
                // Kanji that will be in one of the upper levels
                else if ((renderSettings & R_UNKNOWN) && level > levelThreshold) {
                    var classIndex = (level - levelThreshold) / (levelCount - levelThreshold);
                    classIndex *= (COLOR_STEPS - 1);
                    className = Math.round(classIndex);
                }

                // NOTE to self: !== is needed because 0 == ""

                // Level changed from previous char, 
                if (className !== previousClass) {
                    if (previousClass !== "")
                        output += "</span>";

                    if (className !== "")
                        output += '<span class="wk_' + className + '">'; /*'" title="Level: ' + (level > 0 ? level : "None") + ' ">';*/
                }

                previousClass = className;
                output += chr;
                continue;
            }

            if (previousClass !== "")
                output += "</span>";
            previousClass = "";

            // Default: Write the character with no modifications
            output += chr;
        }

        // Close last opened span tag
        if (previousClass !== "")
            output += "</span>";

        return output;
    });
}

/*
 * Returns a string containing all kanji of the input string
 */
function getKanjiInString(str) {
    // Remove all non-kanji characters
    str = str.replace(notKanjiRegexp, "");
    // Remove duplicates
    str = str.split("").filter(function (x, n, s) {
        return s.indexOf(x) == n;
    }).sort().join("");
    return str;
}

/* 
 * Converts and returns a one-dimensional Kanji->Level map of the specified Level->Kanji dictionary.
 */
function buildKanjiMap(dict, additional) {
    var map = {};
    var dict = unsafeWindow.dictionary;
    var customKnown = unsafeWindow.knownKanji;
    var customSeen = unsafeWindow.seenKanji;

    // If the  dictionary is an array, indices (keys) are 0-based
    var offset = (dict instanceof Array) ? 1 : 0;

    for (var level in dict) {
        var kanjiList = dict[level];
        for (var i = 0; i < kanjiList.length; ++i) {
            map[kanjiList[i]] = parseInt(level) + offset;
        }
    }

    // Insert / update specified additional kanji
    for (var i = 0; i < customKnown.length; ++i) {
        // Only use the 'additional' tag for kanji that have not been in one of the levels yet!
        // ... and kanji that are not in the dictionary at all, of course!
        if (map[customKnown[i]] > unsafeWindow.levelThreshold
         || map[customKnown[i]] == null)
            map[customKnown[i]] = -1;
    }
    for (var i = 0; i < customSeen.length; ++i) {
        // Do the same for seen as for known
        if (map[customSeen[i]] > unsafeWindow.levelThreshold
         || map[customSeen[i]] == null)
            map[customSeen[i]] = -2;
    }

    return map;
}

/*
 * Returns all WK Kanji categorized by their respective levels. This is the default dictionary that is used by the script.
 */
function getWKKanjiLevels() {
    return [
    /* 1:*/ "一,七,三,上,下,九,二,人,入,八,力,十,口,大,女,山,川,工",
    /* 2:*/ "丁,中,丸,了,五,六,円,出,刀,千,又,右,四,土,夕,天,子,小,左,手,才,文,日,月,木,本,正,水,火,犬,玉,王,田,白,目,立々",
    /* 3:*/ "万,今,元,公,内,冬,分,切,北,午,半,友,古,台,外,太,少,市,広,引,心,戸,方,止,母,毛,父,牛,生,用,矢",
    /* 4:*/ "不,世,主,仕,他,代,休,先,写,去,号,名,央,字,宝,平,年,打,早,村,気,氷,申,男,町,百,皿,石,礼,竹,糸,耳,花,虫,見,貝,赤,足,車",
    /* 5:*/ "交,会,体,何,作,兄,光,同,回,図,声,多,学,弟,当,形,来,林,毎,皮,社,空,米,羽,考,肉,自,色,草,行,西,角,言,谷,走,近,里,金,雨,青,音,麦",
    /* 6:*/ "両,亡,京,全,前,化,南,向,国,地,夜,妹,姉,安,室,州,店,後,思,明,星,曲,有,東,次,歩,死,活,海,点,画,直,知,私,科,羊,茶,血,長,食,首",
    /* 7:*/ "付,以,夏,失,家,弱,強,必,教,時,未,末,札,校,欠,氏,民,理,由,紙,組,船,記,辺,通,週,雪,風,高,魚,鳥,黄,黒",
    /* 8:*/ "住,助,医,反,君,場,対,局,役,所,投,支,数,朝,森,楽,池,決,番,研,究,答,絵,者,話,買,身,道,間,雲,電,馬",
    /* 9:*/ "乗,予,事,仮,使,保,具,勝,受,和,売,定,実,客,屋,度,持,新,服,泳,物,界,発,相,県,美,苦,表,要,試,談,負,返,送,部,重,験",
    /*10:*/ "始,最,業,横,歌,求,漢,病,算,終,線,習,聞,落,葉,親,語,読,調,起,路,転,軽,農,速,進,運,配,酒,鉄,開,院,集,頭,顔,飲,鳴",
    /*11:*/ "争,令,仲,伝,位,低,便,働,共,初,別,利,功,努,労,味,命,好,岸,意,成,戦,拾,指,放,昔,波,注,洋,特,神,秒,競,級,老,育,良,追",
    /*12:*/ "倍,僕,勉,動,合,員,商,寒,島,庭,待,息,悪,旅,族,暑,期,根,植,歯,泉,流,消,深,温,港,湯,球,登,着,短,祭,章,童,第,都,野,陽,階",
    /*13:*/ "像,億,問,器,士,宿,情,想,感,整,料,映,暗,様,標,橋,殺,然,熱,疑,皆,福,緑,練,詩,課,謝,賞,輪,選,銀,鏡,題,願,養,館,駅",
    /*14:*/ "例,卒,協,参,周,囲,固,基,妥,季,完,希,念,性,技,折,望,材,束,松,格,残,的,約,能,芸,術,雰,頑,骨",
    /*15:*/ "丈,仏,信,列,勇,区,単,司,坂,変,夫,寺,岩,帰,建,式,春,昨,昼,晩,晴,毒,法,泣,浅,猫,秋,築,紀,英,計,軍,飯",
    /*16:*/ "係,典,冒,冗,危,取,品,園,存,守,専,幸,府,弁,急,政,曜,書,治,浴,留,真,笑,箱,荷,証,辞,遠,門,関,阪,険,面",
    /*17:*/ "側,兵,劇,原,喜,因,堂,塩,官,察,席,常,干,幻,底,恋,悲,愛,敗,是,果,栄,梅,渉,無,細,結,署,薬,虚,覚,詳,説,識,警,非,鼻",
    /*18:*/ "借,僧,句,可,告,喫,報,座,弓,忘,枚,汽,洗,焼,煙,祈,禁,禅,種,等,胸,脳,訓,許,達,静,類",
    /*19:*/ "乱,冊,加,史,善,団,宇,宙,容,履,布,徒,得,忙,改,昆,易,暴,歴,比,混,減,笛,節,絡,続,舌,若,詞,財,連,閥,順",
    /*20:*/ "余,個,倒,厚,困,圧,在,夢,妨,妻,嫌,害,尻,尾,械,機,災,犯,率,産,確,穴,経,罪,臭,被,裕,論,議,防,難,震,飛",
    /*21:*/ "件,任,企,判,制,務,増,委,審,岡,批,挙,敵,断,条,査,検,権,派,済,省,税,素,総,義,解,設,評,認,責,資,際",
    /*22:*/ "価,値,副,勢,各,吸,営,坊,域,姿,宮,寝,応,態,提,援,案,状,示,策,統,置,罰,脱,藤,観,誕,費,賀,過,領",
    /*23:*/ "乳,俳,停,備,優,則,割,収,呼,城,宅,導,崎,師,幹,張,律,施,沢,準,演,現,看,秀,職,裁,規,護,贅,革,鬼",
    /*24:*/ "供,型,境,届,展,層,差,庁,担,株,武,燃,狭,環,祝,管,肩,腕,腰,製,視,触,象,販,質,載,輸,述,違,量,額",
    /*25:*/ "与,候,効,含,居,属,巻,影,慣,抜,捕,捜,掛,景,替,構,模,況,渡,満,票,絞,肥,補,訟,訴,豊,輩,逮,限,隠,響,鮮",
    /*26:*/ "再,刺,創,励,占,印,往,従,復,徴,怪,我,振,授,接,故,汗,河,激,独,獣,突,筆,菓,討,豚,貯,較,造,郵,針,鉛,障",
    /*27:*/ "健,就,屈,康,怒,悩,惑,招,昇,暇,極,段,濃,症,痛,眠,睡,端,給,締,織,胃,腹,訪,誘,貸,迫,迷,退,途,郎,靴",
    /*28:*/ "並,修,傘,児,冷,凍,処,券,博,奇,妙,婦,巨,幼,庫,微,憲,撃,攻,浜,清,潔,益,移,程,稚,精,絶,綺,衆,逆,録,隊,麗",
    /*29:*/ "乾,促,催,僚,壊,娘,宗,宴,寄,怖,恐,杯,板,欧,江,添,烈,猛,略,監,督,積,索,緊,臣,航,街,診,詰,請,閣,雄,韓",
    /*30:*/ "乏,婚,延,快,懐,押,撮,旗,更,枕,浮,渇,漏,照,版,盗,符,系,翌,背,覧,貧,購,越,遊,適,預,飾,騒,魅",
    /*31:*/ "似,倉,偵,嘆,均,墓,孫,富,尋,巣,帯,幾,廊,径,徳,掃,探,救,散,既,普,棒,泥,粉,編,脈,菜,華,融,豪,貨,鑑,除,陸,離,驚",
    /*32:*/ "久,傷,党,卵,厳,密,序,志,恩,捨,採,暖,机,染,桜,欲,永,汚,液,眼,祖,秘,績,興,衛,複,訳,賛,込,迎,酸,銭,雑,飼",
    /*33:*/ "否,垂,宣,尊,忠,拡,操,敬,暮,漠,灰,熟,異,皇,盛,砂,窓,筋,簡,糖,納,肺,著,蒸,蔵,装,裏,誌,諸,賃,閉",
    /*34:*/ "丼,刻,勤,吐,奴,射,幕,承,拝,推,揮,損,枝,歓,沿,源,爪,磁,粋,紅,純,縦,縮,聖,腐,臓,芋,薦,誤,豆,貴,降,隷",
    /*35:*/ "亀,互,介,剣,厄,噌,寿,己,彫,彼,恥,払,杉,汁,油,測,湖,滞,炎,為,熊,獄,破,紹,舎,講,遅,酔,酢,醤,銅,鍋",
    /*36:*/ "伎,伸,依,債,及,奈,姓,将,幅,廃,換,摘,旧,核,沖,津,牙,献,甘,療,盟,継,維,縄,舞,般,諾,貿,超,踏,遺,頼,鹿",
    /*37:*/ "償,兆,刑,削,募,執,塁,契,崩,弾,恵,患,戻,抗,抱,抵,掲,旬,昭,湾,漁,爆,狙,聴,臨,葬,跡,跳,遣,闘,陣,香",
    /*38:*/ "伴,併,傾,刊,却,奏,奥,妊,娠,宜,慮,懸,房,扱,抑,択,描,盤,称,緒,緩,繰,致,託,賂,賄,贈,逃,避,還,需,齢",
    /*39:*/ "仙,充,免,勧,圏,埋,埼,壁,奪,岐,御,慎,拒,控,斐,枠,棋,渋,片,甲,祉,稲,群,謙,譲,躍,邦,鈴,銃,鋼,阜,隆,雇,項",
    /*40:*/ "俊,兼,剤,吹,唱,堀,孝,巡,戒,排,携,敏,敷,柱,殖,殿,犠,獲,繁,茂,薄,衝,褒,誉,透,鋭,隣,雅,頻,顧,駆,駐",
    /*41:*/ "仁,伺,侵,偽,儀,包,墟,徹,拠,拳,措,撤,棄,樹,潜,瀬,炭,畑,至,艦,虎,蛍,蜂,蜜,衣,誠,遜,郷,酎,鉱",
    /*42:*/ "克,到,双,哲,喪,堅,床,弧,括,挑,掘,揚,握,揺,斎,暫,析,枢,柄,泊,滑,潟,焦,範,糾,紛,綱,網,肝,芝,荒,袋,軸",
    /*43:*/ "刷,即,垣,威,封,岳,慰,懇,懲,摩,撲,擦,斉,旨,朗,柔,沈,沼,泰,滅,滋,潮,炉,牧,珍,琴,筒,籍,裂,襲,誰,貢,趣,距,露",
    /*44:*/ "丘,侍,俺,刃,匹,叫,叱,吉,塔,姫,娯,寸,嵐,忍,斗,朱,桃,梨,棚,涙,砲,竜,笠,粒,縁,缶,翼,芽,謎,辛,釣,雷,髪",
    /*45:*/ "也,井,凶,卓,呪,塊,塾,嫁,嬢,暦,曇,湿,溝,滝,澄,狂,狩,疲,眺,矛,硬,磨,稼,翔,肌,脚,舟,菌,裸,賭,鐘,陰,霊,頃,魂",
    /*46:*/ "俵,吾,墨,孔,寧,寮,帝,幽,庄,斬,架,棟,椅,歳,泡,涼,猿,癖,盆,瞬,瞳,碁,租,穂,穏,綿,菊,誇,鈍,錬,鍛,鍵,阻,零,魔,鳩,黙",
    /*47:*/ "伊,佐,哀,唇,塀,墜,如,婆,尺,崖,巾,帽,幣,恨,憎,憩,扇,扉,挿,掌,柳,欺,滴,炊,爽,畳,瞭,砕,箸,粘,粧,胴,芯,虹,詐,霧",
    /*48:*/ "咲,培,塗,尽,帳,彩,悔,憶,斜,殴,溶,灯,班,畜,盾,穫,耐,脅,脇,蓄,蚊,蛇,貼,賢,踊,輝,辱,迅,遂,鉢,闇,隙,霜,飢,餓,騎,麻",
    /*49:*/ "俗,刈,剛,劣,勘,唯,壇,奨,妃,尼,征,悟,抽,拓,拘,桑,概,浸,淡,潤,煮,珠,礎,紫,衰,覆,誓,謀,陛,陶,隔,駒,鶴",
    /*50:*/ "亭,仰,伯,偶,后,唐,堤,堰,墳,壮,奮,峰,巧,廷,彰,把,搬,晶,洞,涯,淀,漂,漫,疫,簿,翻,蟹,訂,諮,軌,邪,銘,駄,鬱,鰐",
    /*51:*/ "亮,偉,召,喚,塚,媛,慈,挟,枯,沸,浦,渦,濯,燥,玄,瓶,耕,聡,肪,肯,脂,膚,苗,蓮,襟,貞,軒,軟,邸,郊,郡,釈,隅,隻,頂",
    /*52:*/ "乃,倫,偏,呂,唆,噴,孤,怠,恒,惰,慢,擁,殊,没,牲,猟,祥,秩,糧,綾,膨,芳,茨,覇,貫,賠,輔,遇,遭,鎖,陥,陳,隼,須,颯",
    /*53:*/ "丹,准,剰,啓,壌,寛,帥,徐,惨,戴,披,据,搭,曙,浄,瓜,稿,緋,緯,繊,胞,胡,舗,艇,莉,葵,蒙,虐,諒,諭,錦,随,駿,騰,鯉",
    /*54:*/ "且,傲,冠,勲,卸,叙,呆,呈,哺,尚,庶,悠,愚,拐,杏,栞,栽,欄,疎,疾,痴,粛,紋,茎,茜,荘,謡,践,逸,酬,酷,鎌,阿,顕,鯨",
    /*55:*/ "之,伏,佳,傍,凝,奉,尿,弥,循,悼,惜,愉,憂,憾,抹,旦,昌,朴,栃,栓,瑛,癒,粗,累,脊,虜,該,賓,赴,遼,那,郭,鎮,髄,龍",
    /*56:*/ "凛,凡,匠,呉,嘉,宰,寂,尉,庸,弊,弦,恭,悦,拍,搾,摂,智,柴,洪,猶,碑,穀,窒,窮,紳,縛,縫,舶,蝶,轄,遥,錯,陵,靖,飽",
    /*57:*/ "乙,伐,俸,凸,凹,哉,喝,坪,堕,峡,弔,敢,旋,楓,槽,款,漬,烏,瑠,盲,紺,羅,胎,腸,膜,萌,蒼,衡,賊,遍,遮,酵,醸,閲,鼓",
    /*58:*/ "享,傑,凌,剖,嘱,奔,媒,帆,慨,憤,戯,扶,暁,朽,椎,殻,淑,漣,濁,瑞,璃,硫,窃,絹,肖,菅,藩,譜,赦,迭,酌,錠,陪,鶏",
    /*59:*/ "亜,侮,卑,叔,吟,堪,姻,屯,岬,峠,崇,忌,慶,憧,拙,擬,曹,梓,汰,沙,浪,漆,甚,睦,礁,禍,篤,紡,胆,蔑,詠,遷,酪,鋳,閑,雌",
    /*60:*/ "倹,劾,匿,升,唄,囚,坑,妄,婿,寡,廉,慕,拷,某,桟,殉,泌,渓,湧,漸,煩,狐,畔,痢,矯,罷,藍,藻,蛮,謹,逝,醜"
    ];
};

/*
 * BASED ON (SLIGHT MODIFICATIONS)
 * jQuery replaceText - v1.1 - 11/21/2009
 * http://benalman.com/projects/jquery-replacetext-plugin/
 *
 * Copyright (c) 2009 "Cowboy" Ben Alman
 * Dual licensed under the MIT and GPL licenses.
 * http://benalman.com/about/license/
 */
(function ($) {
    $.fn.forEachText = function (callback) {
        return this.each(function () {
            var f = this.firstChild,
                g, e, d = [];
            if (f) {
                do {
                    if (f.nodeType === 3) {
                        g = f.nodeValue;
                        e = callback(g);
                        if (e !== g) {
                            if (/</.test(e)) {
                                $(f).before(e);
                                d.push(f)
                            } else {
                                f.nodeValue = e
                            }
                        }
                    }
                } while (f = f.nextSibling)
            }
            d.length && $(d).remove()
        })
    }
})(jQuery);
