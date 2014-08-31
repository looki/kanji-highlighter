kanji-highlighter
=================

Greasemonkey userscript that highlights kanji on websites based on their level of familiarity. This makes it easy to classify the difficulty of sentences or texts and when you will be able to read them entirely. Cases where you encounter a kanji and are not sure whether it's one you've learned or a slightly different one are eliminated. Overall, it's really rewarding to witness the yellow and red kanji vanish from pages.
The script is optimized for people who follow a set order in which they learn the kanji and by default matches the levels of the [WaniKani] website. Making the script more useful to the general public is high on the list.

![Example screenshot](http://i.imgur.com/mqH25kO.png)
Here, all kanji that are already classified as known are not highlighted in any way. A yellow shade means that a kanji will be learned very soon using the specified order, and red means that it can be found in the latter half of the remaining kanji. Grey means that the kanji is not part of the list used.

[WaniKani]: http://wanikani.com

## TODO

* Make the script more general purpose for other ways of learning
* Implement an options dialog via GM_config
* Allow the user to configure the highlight scheme more thoroughly
* Add support for auto-updating the WaniKani level via API
* Add more useful tools and statistics related to kanji
* (Maybe) add support for vocabulary via language parsing
