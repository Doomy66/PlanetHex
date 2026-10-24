# PlanetHex Application

One application at four levels — a planet, a system, a subsector, a sector — and the landing page that opens them.

This document is the shell. [PlanetSpec.md](PlanetSpec.md) specifies a planet, [SystemSpec.md](SystemSpec.md) specifies a system, and [SubSectorSpec.md](SubSectorSpec.md) specifies a subsector and the sector above it; none of them changes because of what is here. Clauses are numbered the same way, and *the planet spec*, *the system spec*, and *the subsector spec* mean those three documents.

## Contents

1. [Purpose](#1-purpose)
2. [The landing page](#2-the-landing-page)
3. [New and Load](#3-new-and-load)
4. [What a folder holds](#4-what-a-folder-holds)
5. [Loading a folder](#5-loading-a-folder)
6. [Moving between levels](#6-moving-between-levels)
7. [Unsaved work](#7-unsaved-work)
8. [Importing a published sector](#8-importing-a-published-sector)
9. [Open questions](#9-open-questions)

---

## 1. Purpose

1.1 The application works at four levels. A **planet** is one world, its surface, and everything the planet spec describes. A **system** is one star or several, with its belts, its gas giants, and its worlds. A **subsector** is eighty hexes, each of which is empty space or a system. A **sector** is sixteen subsectors.

1.2 Each level is a document of its own with its own seed, its own save, and its own view. The application opens on a landing page that offers New and Load at each of the four, and nothing else.

1.2.1 A landing page rather than opening straight into a planet, because there are now four things a user might have come to do and no way to guess which. The application used to have one answer and so needed no question.

1.3 The levels form a chain of seeds: a sector seed fixes its sixteen subsector seeds, a subsector seed fixes the seed of the system in each of its eighty hexes, a system seed fixes its stars and the seed of each world in it, and a world seed fixes the surface. So a whole sector is one short string, and every world in it is the same world whether it was reached from the top or opened alone.

1.3.1 This is the subsector spec 1.3 extended along the whole chain, and it carries the same obligation at every link: a document generated from above must be identical to the same document opened by its own seed. Nothing at a higher level may modify what a lower level generates, only record what the user typed over it.

1.3.1.1 What a higher level may do is fill in a stored field that was waiting to be filled in: a profile under the planet spec 6.7, a world's orbit and rotation under 6.15, where null means nobody has said and a value means somebody has. A value arriving from a parent is that field arriving filled in, exactly as one typed by the user is. The system spec 6.6 is where this matters most and where it is argued out, since placing a world in an orbit reaches its climate and so its surface.

1.3.1.2 So the obligation of 1.3.1 is precise rather than absolute: what a seed fixes is the document given its settings, and a parent that writes a setting must write it into the document rather than hold it privately. That is what keeps the app spec 4.8 true - a document saved inside a parent still stands by itself.

1.3.2 The system level is the link that was missing. The subsector spec 3.8.3 had a hex hold a main world and two counts, because there was nothing to open a second world into. There is now, so a hex holds a system, and the main world is the one the subsector draws rather than the only one there is.

1.4 A planet opened from the landing page behaves exactly as the planet spec 6.4 already describes, including its file picker and the folder of 6.4.1.

1.4.1 A planet reached through a system does not get a folder of its own. The system folder is the floor, and a planet in one is files in it, under 4.2. This is the only thing in this document that changes how a planet is saved.

## 2. The landing page

2.1 The landing page is four rows, one per level, each with New and Load, each saying in a line what the level is for.

2.2 The rows read planet, system, subsector, sector, smallest first. Most sessions are a planet, the levels above are the new thing rather than the usual thing, and a user looking for what they did last time should find it without reading down.

2.3 Below the rows is the recent list: the documents last opened, each with its level, its name, and where it came from, most recent first.

2.3.1 A recent entry reopens what it names without a picker where the browser still holds permission for it, and asks for the folder again where it does not. The File System Access API keeps handles across sessions but not the grant to use them, so a reopen can cost one click.

2.3.2 An entry whose folder has been moved or deleted says so where it sits and offers to be forgotten, rather than failing when it is clicked.

2.4 The landing page is reachable from every level, and returning to it closes the open document under 7.2.

2.5 Nothing is generated by the landing page itself. It is a chooser, and a user who opens it and closes it again has rolled nothing.

2.6 **Saying something about it.** The landing page carries the help, the release notes and a way to suggest something, with the version beside them. A user who has just arrived wants to know what the thing is; a user who has been using it for a month wants to tell somebody what it should do next. Below them are the other two applications in the family, MainLine and the Traveller Ship Designer, and the short form of Mongoose Publishing's notice.

2.6.0.1 The help too, although most of it is about a planet. The foot is the same across the three applications, and a family that kept its help in a different place in each would read as three strangers. It opens over the landing as it does over a planet.

2.6.1 The release notes, the suggestion link and the version sit at the foot of the help as well, because somebody reading about the application is the likeliest person to have something to say about it.

2.6.2 A suggestion is a link to a new issue on the project, not a form in the application. A form needs somewhere to send to, a way to keep spam out of it, and a promise that somebody is reading it; a link costs none of that, and the person who reported the thing keeps their own issue and can see what happens to it.

2.6.2.1 It carries the version and whatever level and seed was open. A report that says which seed it was is a report that can be reproduced, and nobody remembers to include it. Nothing else goes: the body is the user's to write, and an application that filled it in for them would be reporting its own opinion.

2.6.3 What the page says about itself is what somebody who arrived without being told needs: four levels kept in step, everything from a seed, the surface rebuilt rather than stored, and what you write over it being all that is kept. The mark goes above the name, so the two read as one thing.

2.6.4 The short form of the notice is "An unofficial, non-commercial fan work. The Traveller game in all forms is owned by Mongoose Publishing. Copyright 1977 – 2025 Mongoose Publishing.", with a link to the publisher. Mongoose Publishing's Fair Use Policy allows the short form only where it points to the whole notice, so it ends in a Fair use notice link that opens the help at the notice in full.

## 3. New and Load

3.1 **New** at any level opens a fresh document with a new random seed, immediately, with no dialogue in front of it. The name, the seed, and the settings are all editable once it is open, and the planet spec 6.4 already works this way.

3.1.1 No dialogue first because every field it could ask for is on screen a second later anyway, and because the fastest way to find out whether a seed is any good is to look at it. A new document is not a commitment: New again is one click.

3.2 **Load** at the planet level opens a file picker on the planet's JSON, unchanged from the planet spec 6.4.1.1.

3.3 **Load** at the system, subsector, and sector levels opens a directory picker, and what is chosen is the folder holding that level's data, not a file inside it.

3.3.1 A folder rather than a file because at these levels a document is a folder of things: a system holds its worlds, a subsector holds its systems and the exports of the subsector spec section 6, and a sector holds its subsectors. Picking the JSON would name one file out of a set and leave the application unable to reach the rest, which is exactly the trap the planet spec 6.4.1.4 documents.

3.3.2 A folder load knows where it loaded from, so the folder is the save folder from that moment on and no later Save asks. This is the one thing a planet load still cannot do, and 8.1 asks whether a planet should be loaded by folder too.

3.3.3 Where the directory picker is not available — a browser that is not Chromium, under the planet spec 6.4.1.3 — the level loads from a zip of the folder instead, through the same fallback the planet save already uses in [src/io/files.ts](src/io/files.ts). A zip of a folder holds the folder's shape, so nothing about sections 4 and 5 changes.

## 4. What a folder holds

4.1 Every document carries the level it is, alongside the version the planet spec 6.4.2 requires. A loader that opens a folder is looking for a document of a stated level, and a document that says what it is can be checked rather than guessed at from its shape.

4.1.1 It also says so in its name. JSON inside, but `.planet`, `.system`, `.subsector` and `.sector` outside, so a folder says at a glance which file is the subsector and which are the worlds. A referee looking for their subsector should not have to open three files called something.json to find out which one it is. Documents written before this are `.json` and are still read.

4.1.2 **A level's save is one document, carrying the levels below it that somebody has worked on.** A subsector document holds the systems worked up under it; each of those holds the worlds worked up under it. One Save, at the level you opened, and one file.

4.1.2.1 This is affordable because of 1.3: nothing generated is stored. A world carries its name, its profile and what the referee wrote on it, not its surface — so a subsector with twenty systems and a dozen annotated worlds is a few hundred kilobytes of text. What would make embedding expensive is the one thing this application never stores.

4.1.2.2 It was a folder of files per level first, one document each. That is a defensible shape on disk and it was the wrong shape to use: three levels meant three Save buttons, three unsaved marks, and a referee working down a chain being asked to save at every step and to remember which folder each step went into. The saving was harder than the work.

4.1.2.3 What it costs is handing somebody a single system out of a subsector. That is an export rather than a reason to shape the save format, and section 6 is where exports live.

4.1.2.4 A planet opened on its own is unchanged: its own document, its own Save, its own folder. That is the level this application began at, and a world of a system is the same document with a place in one.

4.1.3 A document also carries the date, which is the system spec 3.5 and the one field in this application that is about the setting rather than about the document holding it. Every level that can hold a system holds it, and the level at the top of what is open is the one whose date counts — the same rule the system spec 9.7.3 sets for where a system sits.

4.2 **A planet is files, not a folder.** Its document and whatever images and exports were asked for, all named on one stem. A planet opened on its own is saved into a folder the user picks; a world of a system is carried by that system under 4.1.2 and needs no file of its own until somebody exports one.

4.2.1 The stem is the system's name and the world's orbit, under the system spec 7.2: the third world of Sol is `Sol-3.json`, with `Sol-3` on every image and export beside it.

4.2.1.1.1 A designation is a token and its spaces close up: the first belt of Regina reads as "Regina Belt-1" and is `Regina-Belt-1.json` on disk. A world's own name is left as written, since a name is prose — a planet called New Hope is `New Hope.json`.

4.2.1.2 A world carries its own designation in its document. It cannot be worked out at save time, because a world opened from a file has no system to ask: the file is the whole of what is known about it, which is the same reason 1.3.1 has a saved world carry its star and its orbit. A world handed down from a system is given its designation as it is opened, and keeps it from then on.

4.2.1.1 The stem is where the world is, not what it is called. A world named Earth is still `Sol-3` on disk, because a folder of files is read by somebody looking for the third orbit of a system whose folder they are already standing in. The name is in the document, on the map, and on the sheet; the filename's job is to say which world this is among the eight in the folder.

4.2.2 A folder each would mean a system of eight worlds was eight folders holding one file apiece. A folder is the unit of a save, and a system is the smallest thing worth one: the worlds in it are a set that arrived together and belong together.

4.2.3 Nothing collides, because the stem carries the system name and the orbit, and a system has one third orbit. Two systems each with a third world are `Sol-3` and `Regina-3`, in two folders, and neither has to know about the other.

4.2.4 A planet opened from the landing page under 1.4 has no system and so no orbit to be named for. Its designation is empty, it is named for itself, and it is saved into a folder the user picks with nothing else in it. That folder is a system folder with no system document, which 5.3 already knows how to open.

4.2.4.1 This is not a fallback, it is the other half of the feature. A planet on its own is a whole document at the level this application began with, and a world of a system is the same document with a place in one. Nothing about a planet requires a system; the designation is a thing a system gives it, and a world that was never given one is not missing anything.

4.2.4.2 A save written before designations existed reads as a planet of its own, since that is what every planet was when it was written.

4.3 **A system folder** is the lowest folder there is. It holds the system's document — worlds and all, under 4.1.2 — and the system's own exports.

4.4 **A subsector folder** holds the subsector's document — systems and their worlds and all, under 4.1.2 — and the exports of the subsector spec section 6 that were asked for.

4.4.1 So a folder at any level holds one document and whatever exports were asked for beside it. The same shape everywhere, and a shape a reader can see rather than a rule they have to learn.

4.5 **A sector folder** holds the sector's JSON and a folder for each subsector that has been saved, named for its letter and its name. Each of those is an ordinary subsector folder under 4.4.

4.6 At every level, only what was actually worked on. The subsector spec 5.7.1 refuses to carry eighty systems nobody has looked at, and that reasoning runs the whole way up: a system is its seed until somebody does something to it, and so is a subsector. A sector whose sixteen are all still as generated is one file in an otherwise empty folder, and that is a complete sector.

4.7 Every folder at every level is an ordinary folder of its own level, and opens on its own. A planet file copied anywhere opens as a planet through the picker of 3.2, with no system anywhere near it.

4.8 A document saved inside a parent is written with its derived seed spelled out, not with a note saying which parent to ask.

4.8.1 This is what makes 1.3's chain a convenience rather than a dependency. The chain fixes what a document starts as; once written, the document stands by itself.

4.9 A folder at any level may hold anything else the user has put in it. Nothing is deleted, and nothing unrecognised is complained about. A referee's own notes, maps, and handouts belong in the folder with the thing they are about.

4.9.1 **What a level says about itself, the level above hears.** Rename a world or type over its profile and the system it is in says the new name, and the subsector above the system says it too. A name and a profile are what the levels above draw, so a change to either has to reach them or two levels are describing one world differently.

4.9.1.1 It lands as an override at the level above, which is where every typed value in this application lives — the world document holds everything about the world, and the override holds the part the levels above are looking at. So it obeys the same rule as any other override: typed back to what the generator said, it goes away again.

4.9.1.2 A main world and its system are one thing named once, under the system spec 7.3.4.1. Renaming the main world renames the system, and renames the hex on the subsector.

4.9.1.3 Nothing flows the other way by itself. A level above sets what a level below starts as, under 1.3; once a world exists, what it says about itself is its own.

4.10 **One Save per chain.** The level you opened owns the document, and the levels below it do not offer a Save of their own — a world reached through a system and a subsector is saved by that subsector.

4.10.1 Nor an unsaved mark of their own. Work done at any level marks the level that will save it, so there is one place to look and one thing to press.

4.10.2 And moving up the chain asks nothing. Going from a world to its system loses nothing, because the system carries the world, so a dialogue warning that the work will be lost would be telling the user something untrue to make them press a button they did not need. Only leaving the levels altogether can lose anything, and that is where the question belongs.

## 5. Loading a folder

5.1 Load looks in the chosen folder for a document of the level asked for, and opens it.

5.2 Where the folder holds a document of a different level, the application says which level it actually found and offers to open it at that level. A user who picks a system folder from the subsector row has told the application what they want well enough.

5.3 Where the folder holds no document at all, but holds folders that do, the application says so and names what it found. The commonest way to reach this is picking the folder above the one meant.

5.4 Where the folder holds more than one document of the level asked for, the application lists them and asks which.

5.5 A document that fails validation fails loudly and names the file, as the planet spec 6.4.3 requires. A sector whose subsector folder holds a broken document opens anyway, with that subsector generated from the seed and the failure reported, because the other fifteen are not at fault. The same holds at every level: a broken child is one child, and its parent is not wrong.

5.6 Reading a folder needs directory iteration, which the handle type in [src/io/files.ts](src/io/files.ts) does not yet expose: it can get a file by name and nothing else. That type grows the two methods the API already has for listing entries and reaching subfolders.

## 6. Moving between levels

6.1 Opening a system from a subsector map is a move down, and so is opening a world from a system, and a subsector from a sector. One route, used at three joins.

6.2 A move down keeps the parent open. Coming back arrives at the same view with the same selection and nothing regenerated.

6.3 A document opened by moving down inherits its save folder from the parent: a world opened from a system saves as files in that system's folder under 4.2, with no picker, and the system into its subsector's `Systems` folder.

6.3.1 This is the one place a save folder is chosen for the user rather than by them, and it is chosen because the answer is not in doubt. A world reached through a system belongs to that system's folder. Save As, under 8.3, is how somebody disagrees.

6.3.2 Saving a document whose parent has never been saved saves the parent too, up as far as the first ancestor that has a folder, or to a picker where none of them has. A world three levels down cannot be written into folders that do not exist, and asking the user to save four documents in order is asking them to do the application's arithmetic.

6.4 A document opened from the landing page has no parent and no folder until it is saved, as a planet does today.

6.5 The view says which chain it is in — sector, subsector, system, world — so a user three levels down knows what is behind them, and each step back up is one click on it.

## 7. Unsaved work

7.1 Each open document tracks its own unsaved edits, under the planet spec 6.4.4 and the subsector spec 5.6. Four levels open is four flags, and a prompt names the document it is about.

7.2 Returning to the landing page closes the open chain and checks every document in it first. The prompt lists what is unsaved and offers to save all, discard all, or cancel.

7.2.1 One prompt for the chain rather than one per level, because a user closing a sector is answering a single question about their session, and four dialogues in a row is a way of getting Discard clicked by accident.

7.3 A move down under 6.1 discards nothing and prompts about nothing, since the parent stays open.

7.4 Leaving the page checks the whole chain, on the same terms the planet spec 6.4.4.3 sets out.

## 8. Importing a published sector

8.1 A sector or a subsector may be opened from **published data** rather than rolled: the worlds of a real Traveller sector, as The Traveller Map holds them, placed on this application's own hexes.

8.1.1 Everything this application makes, it makes up. That is the point of it, and it is not what somebody running the Third Imperium needs. A referee who wants the Spinward Marches has no way to get it but to type four hundred worlds in by hand, and the sector level is where that is worst, because sixteen subsectors of invented worlds is the most work and the least use to them.

8.2 **The landing page** carries a third action, *Import*, on the sector row and the subsector row. It opens a picker listing the published sectors, and for a subsector the sixteen letters of the one chosen, named as the data names them.

8.2.1 The list is fetched, never shipped. No sector name, subsector name or world appears in this application's own files, for the reason at 8.6.

8.2.2 The official sectors only. The source holds some five hundred of varying standing, and a list offering a dozen answers to "which Spinward Marches" is worse than one offering forty-five that are the published setting.

8.3 **What is fetched, and when.** Nothing until a sector is chosen. Then the sector's world table and its subsector names, which is one request of about forty kilobytes, or for a subsector alone the thirty-odd lines of that subsector. What has been fetched is kept for the session, so moving between the subsectors of one sector does not ask again.

8.3.1 The application talks to one host and no other, and its content security policy names that host. Nothing else about it reaches a network, and nothing about a document ever leaves the machine.

8.4 **An imported document is an ordinary document.** A seed, a density of *none*, and one override per published world. Nothing below the import knows the worlds were published rather than rolled.

8.4.1 Density *none* rather than eighty decisions per subsector. Every other density is a threshold a fixed per-hex value is tested against, so zero occupies no hex ever, and "no generated world can appear between the real ones" becomes a property of the document rather than something that has to be got right eighty times and stays right only until somebody moves a slider.

8.4.2 The lean of 3.11 is set to nothing. A published sector's profiles are all given rather than rolled, so a thumb on the dice has nothing to press against and would only mislead whoever read it.

8.5 **The seed is keyed on where the sector is** in charted space, and on nothing else. Everything below follows by the chain of 1.3.

8.5.1 So a published world's ground is the same for every user, on every machine, for ever; and the same whether its sector was imported whole or its subsector imported alone, which is 1.3.1.

8.5.2 Not the era, so one world looked at in two centuries is one rock with two profiles written on it rather than two worlds. Not the name, which the source gives differently in different languages. And above all not the profile, so that when the published data is corrected upstream the world's coastline stays exactly where it was and only its digits move.

8.5.3 What is pinned is what was given: the profile, the name, the bases, the zone, the stars, the allegiance and the PBG. What is generated is everything under them, and that moves if the generators ever change — for a published world exactly as it already does for a rolled one. A world opened, worked up and saved is held by the document and moves no more.

8.6 **The data is not ours.** It is Mongoose Publishing's, published under their Fair Use Policy for personal, non-commercial use, and nothing on the source site may be republished without its contributor's consent.

8.6.1 So none of it is held in this repository or in a build. It is fetched to the user's machine when they ask for it and goes nowhere else, and the claim that no setting material ships with the application stays true.

8.6.2 A document records where it came from, and says so in the readout. The sector file export credits the source and carries the fair use line, because that export is the one written to be read by somebody else's tool and is where the data would otherwise travel with nothing on it to say whose it is.

8.7 **What the published columns cannot keep.** The bases of several services collapse to the naval and scout this application draws; the trade codes are worked out again from the profile and the published remarks are kept as a note; a zone of *forbidden* becomes red and *unabsorbed* becomes none; and a system of three stars or more keeps two.

8.7.1 A world whose published profile cannot be read keeps its name and is given no profile at all, with a note saying why. Inventing one would put rolled digits under a real name with nothing to show they were rolled, which is the one outcome worse than a gap.

8.7.2 An unnamed world is named after its hex, for the same reason: left blank, the generator would supply a name that reads as published as the rest.

8.8 **Borders, the express network and polity names** come with the sector, in the same metadata request its subsector names do, and are carried on the document so a saved sector draws them without going back to the network.

8.8.1 A border arrives as a closed ring of hexes along the inside of a boundary. That is the edge of a shape rather than a shape, so what is drawn is the outline of everything the ring encloses — the empty hexes in the middle included, because a polity holds the space between its worlds and no world marks it. The ring is filled by flooding from outside it and keeping what the flood does not reach; the outline is then every edge of a filled hex with nothing filled on the far side.

8.8.1.1 Flooded from the outside rather than the inside because there is no safe way to pick a hex that is inside: a border can be one hex wide, and the middle of its bounding box is then outside it. A corner of a box drawn round the whole thing with room to spare is outside by construction.

8.8.1.2 A polity may have several borders in one sector — the Imperium has four in the Spinward Marches, a main body and three enclaves — so these are a list rather than one for each allegiance. A border may also run off the edge of the sector, and its path says so with hexes outside the thirty-two by forty. Those hexes are real places; they are simply not places this map draws, so the outline is traced over them and only the part on the map is drawn.

8.8.2 Where the published express network is known it **replaces** the routes of the subsector spec 3.3 rather than being drawn beside them. 3.3 wires every pair of good ports within two hexes, which is a fair guess at where the mail would go and is not where it goes; on a map anybody recognises, the difference between a thin published line and a dense computed mesh is the most visible thing on it. Trade routes are left as they were, since nothing published says where a free trader goes.

8.8.3 Allegiance codes are given their published names, so a border is labelled *Zhodani Consulate* rather than `ZhIN`.

8.8.4 Each allegiance is drawn its own way, and a legend says which is which. One colour for every border is a tangle wherever two of them run alongside each other, which on a real map is exactly where the interesting ground is: the Darrian, Sword Worlds and Imperial frontiers in the Spinward Marches are within a few hexes of each other for most of their length.

8.8.4.1 Identity is a hue **and** a dash, not a hue alone. Three hues is as many as can be told apart on this surface by somebody with any of the common colour deficiencies — checked against the map's own background rather than judged by eye — and a sector can hold four polities or five. Three hues against three dashes gives nine, every pair of which differs in a channel nobody is blind to.

8.8.4.2 The look follows the allegiance, not the order its border happened to arrive in: the codes a document holds are sorted, so the same sector always draws the same way and nothing repaints because a border was added after it.

8.8.4.3 A legend is always shown, and every border carries its name. Colour never carries identity on its own.

## 9. Open questions

9.1 **Loading a planet by folder.** A folder load knows where it came from and a file load does not, under 3.3.2, so planets are the only level that still asks for the folder on the next Save. Changing the planet row to a directory picker would close that, at the cost of making a bare JSON file harder to open than it is today. Worth answering; not urgent.

9.2 **Recent list storage.** 2.3 needs handles kept across sessions, which means IndexedDB. What happens on a browser without the File System Access API, where there is no handle to keep and a recent entry can only be a name, is unanswered.

9.3 **Save As.** Nothing above lets a document be saved somewhere other than where it came from, and 6.3.1 wants it to exist. It is a small feature that touches every level, so it is listed here rather than four times.

9.4 **A workspace above sectors.** Several sectors, a map of how they sit against each other, and a name for the whole setting. The arithmetic does not stop at a sector and neither does a campaign. Nothing here forbids it, and nothing here builds it.

9.5 **How deep the chain goes.** [SystemSpec.md](SystemSpec.md) 13.1 would make a moon of a gas giant openable as a planet, which is a fifth level in all but name. Whether that is a level, or a system with one more kind of thing in it, is unanswered.

9.6 **A tenth polity.** 8.8.4.1 gives nine distinguishable looks, which is more than any sector of the published setting needs and not infinitely many. What a tenth should do — fold into a plain unclaimed line, or add a third channel — is unanswered, and nothing in the data has asked the question yet.
