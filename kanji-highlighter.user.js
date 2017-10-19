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
        /* 1:*/ "一二九七人入八力十三上下口大女山川工",
        /* 2:*/ "刀土千夕子小丁了又丸才中五六円天手文日月木水火犬王出右四左本正玉田白目石立々",
        /* 3:*/ "万久今元公内分切午友太少引心戸方牛父毛止兄冬北半古台外市広母用矢生",
        /* 4:*/ "世主他代写去号央平打氷申皮皿礼休先名字年早気百竹糸耳虫村男町花見貝赤足車不仕",
        /* 5:*/ "交会光同回多当毎池米羽考肉自色行西何体作図声売弟形来社角言谷走近里麦学林空金雨青草音",
        /* 6:*/ "化地両全向安州曲有次死羊血京国夜妹姉店明東歩画直知長前南室後思星活海点科茶食首亡",
        /* 7:*/ "欠氏由札民辺付以失必未末校夏家弱時紙記通高強教理組船週雪魚鳥黄黒風",
        /* 8:*/ "支住助医君対局役投決究身者研馬森場朝番答絵買道間雲数楽話電所合反",
        /* 9:*/ "事使具受和始定実服泳物苦表部乗客屋度待持界発相県美負送重談要勝仮予新返",
        /*10:*/ "起速配酒院終習転進落葉軽運開集飲業漢路農鉄歌算聞語読鳴線横調親頭顔病最",
        /*11:*/ "争仲伝共好成老位低初別利努労命岸放昔波注育拾指洋神秒級追戦競良功特便働令意味",
        /*12:*/ "勉庭息旅根流消倍員島祭章第都動商悪族深球童陽階寒悲暑期植歯温港湯登着短野泉",
        /*13:*/ "問宿想感整暗様橋福緑練詩銀題館駅億器士料標殺然熱課賞輪選鏡願養像情謝映疑皆",
        /*14:*/ "例卒協参周囲固季完希念折望材束松残求的約芸基性技格能術私骨妥雰頑",
        /*15:*/ "寺岩帰春昼晴秋計列区坂式信勇単司変夫建昨毒法泣浅紀英軍飯仏築晩猫丈",
        /*16:*/ "園曜書遠門係取品守幸急真箱荷面典喜府治浴笑辞関保弁政留証険危存専冒冗阪",
        /*17:*/ "原細薬鼻側兵堂塩席敗果栄梅無結因常識非干是渉虚官察底愛署警恋覚説幻",
        /*18:*/ "訓試弓告種達類報祈等汽借焼座忘洗胸脳僧禅験可許枚静句禁喫煙",
        /*19:*/ "加節減順容布易財若詞昆閥歴舌冊宇宙忙履団暴混乱徒得改続連善困絡比笛史",
        /*20:*/ "災機率飛害余難妨被裕震尻尾械確嫌個圧在夢産倒臭厚妻議犯罪防穴論経",
        /*21:*/ "敵済委挙判制務査総設資権件派岡素断評批任検審条責省増税解際認企義",
        /*22:*/ "罰誕脱過坊寝宮各案置費価勢営示統領策藤副観値吸域姿応提援状態賀",
        /*23:*/ "収停革職鬼規護割裁崎演律師看準則備導幹張優宅沢贅施現乳呼城俳秀",
        /*24:*/ "担額製違輸燃祝届狭肩腕腰触載層型庁視差管象量境環武質述供展販株",
        /*25:*/ "限与含影況渡響票景抜訴訟逮補候構模捕鮮効属慣豊満肥巻捜絞輩隠掛替居",
        /*26:*/ "造授印創復往較筆鉛貯故障従我激刺励討郵針徴怪獣突菓河振汗豚再接独占",
        /*27:*/ "招段胃腹痛退屈悩暇織貸迷惑誘就訪怒昇眠睡症締迫靴濃端極途健康郎給",
        /*28:*/ "逆巨庫児冷凍幼稚処博清潔録隊修券婦奇妙麗微益移程精絶並憲衆傘浜撃攻綺",
        /*29:*/ "監杯乾催促欧江請雄韓壊診閣僚積督臣略航寄板街宗緊娘宴怖恐添猛烈索詰",
        /*30:*/ "詳魅渇系婚遊旗照快版貧乏適預延翌覧懐押更枕浮漏符購越飾騒背撮盗",
        /*31:*/ "離融編華既普豪鑑除尋幾廊掃泥棒驚嘆倉孫巣帯径救散粉脈菜貨陸似均墓富徳探偵",
        /*32:*/ "序迎志恩採桜永液眼祖績興衛複雑賛酸銭飼傷党卵厳捨込密汚欲暖机秘訳染",
        /*33:*/ "簡閉誌窓否筋垂宝宣尊忠拡操敬暮灰熟異皇盛砂漠糖納肺著蒸蔵装裏諸賃",
        /*34:*/ "誤臓貴降丼吐奴隷芋縮純縦粋聖磁紅射幕拝薦推揮沿源劇勤歓承損枝爪豆刻腐",
        /*35:*/ "遅彫測破舎講滞紹介己厄亀互剣寿彼恥杉汁噌炎為熊獄酔酢鍋湖銅払油醤",
        /*36:*/ "旧姓貿将盟遺伸債及奈幅廃甘換摘核沖縄津献療継維舞伎踏般頼依鹿諾牙超",
        /*37:*/ "跳昭漁償刑募執塁崩患戻抗抵旬湾爆弾聴跡遣闘陣香兆臨削契恵抱掲狙葬",
        /*38:*/ "需齢宜繰避妊娠致刊奏伴併傾却奥慮懸房扱抑択描盤称緒緩託賄賂贈逃還",
        /*39:*/ "邦鈴阜岐隆雇控壁棋渋片群仙充免勧圏埋埼奪御慎拒枠甲斐祉稲譲謙躍銃項鋼",
        /*40:*/ "顧駐駆柱唱孝俊兼剤吹堀巡戒排携敏鋭敷殿犠獲茂繁頻殖薄衝誉褒透隣雅",
        /*41:*/ "遜伺徹瀬撤措拠儀樹棄虎蛍蜂酎蜜墟艦潜拳炭畑包衣仁鉱至誠郷侵偽",
        /*42:*/ "克到双哲喪堅床括弧挑掘揚握揺斎暫析枢軸柄泊滑潟焦範紛糾綱網肝芝荒袋",
        /*43:*/ "誰珍裂襲貢趣距籍露牧刷朗潮即垣威封筒岳慰懇懲摩擦撲斉旨柔沈沼泰滅滋炉琴",
        /*44:*/ "寸竜縁翼吉刃忍桃辛謎侍俺叱娯斗朱丘梨僕匹叫釣髪嵐笠涙缶姫棚粒砲雷芽塔",
        /*45:*/ "澄矛肌舟鐘凶塊狩頃魂脚也井呪嬢暦曇眺裸賭疲塾卓磨菌陰霊湿硬稼嫁溝滝狂翔",
        /*46:*/ "墨鳩穏鈍魔寮盆棟吾斬寧椅歳涼猿瞳鍵零碁租幽泡癖鍛錬穂帝瞬菊誇庄阻黙俵綿架孔",
        /*47:*/ "砕粘粧欺詐霧柳伊佐尺哀唇塀墜如婆崖帽幣恨憎憩扇扉挿掌滴炊爽畳瞭箸胴芯虹巾",
        /*48:*/ "帳蚊蛇貼辱鉢闇隙霜飢餓畜迅騎蓄尽彩憶溶耐踊賢輝脅麻灯咲培悔脇遂班塗斜殴盾穫",
        /*49:*/ "駒紫抽誓悟拓拘礎鶴刈剛唯壇尼概浸淡煮覆謀陶隔征陛俗桑潤珠衰奨劣勘妃",
        /*50:*/ "峰巧邪駄唐廷鬱鰐蟹簿彰漫訂諮銘堰堤漂翻軌后奮亭仰伯偶淀墳壮把搬晶洞涯疫",
        /*51:*/ "偉頂召挟枯沸濯燥瓶耕肯脂膚軒軟郊隅隻邸郡釈肪喚媛貞玄苗渦慈襟蓮亮聡浦塚",
        /*52:*/ "陥貫覇呂茨擁孤賠鎖噴祥牲秩唆膨芳恒倫陳須偏遇糧殊慢没怠遭惰猟乃綾颯隼輔",
        /*53:*/ "寛胞浄随稿丹壌舗騰緯艇披錦准剰繊諭惨虐据徐搭蒙鯉戴緋曙胡瓜帥啓葵駿諒莉",
        /*54:*/ "鯨荘栽拐冠勲酬紋卸欄逸尚顕粛愚庶践呈疎疾謡鎌酷叙且痴呆哺傲茎阿悠杏茜栞",
        /*55:*/ "伏鎮奉憂朴栃惜佳悼該赴髄傍累癒郭尿賓虜憾弥粗循凝脊昌旦愉抹栓之龍遼瑛那",
        /*56:*/ "拍猶宰寂縫呉凡恭錯穀陵弊舶窮悦縛轄弦窒洪摂飽紳庸靖嘉搾蝶碑尉凛匠遥智柴",
        /*57:*/ "賊鼓旋腸槽伐漬坪紺羅峡俸醸弔乙遍衡款閲喝敢膜盲胎酵堕遮烏凸凹楓哉蒼瑠萌",
        /*58:*/ "硫赦窃慨扶戯忌濁奔肖朽殻享藩媒鶏嘱迭椎絹陪剖譜淑帆憤酌暁傑錠凌瑞菅漣璃",
        /*59:*/ "遷拙峠篤叔雌堪吟甚崇漆岬紡礁屯姻擬睦閑曹詠卑侮鋳蔑胆浪禍酪憧慶亜汰梓沙",
        /*60:*/ "逝匿寡痢坑藍畔唄拷渓廉謹湧醜升殉煩劾桟婿慕罷矯某囚泌漸藻妄蛮倹狐"
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
