# info.json specification

This information is meant for people wishing to develop an API about the Pepper&Carrot episodes.
There are efforts to build a full API on top of this:

* https://www.peppercarrot.com/0_sources/episodes.json
* https://framagit.org/valvin/peppercarrot-api/

---

Each episode directory has a `info.json` file at root that contains raw metadata about the episode. It may
contain the following keys. Unless otherwise stated below, any and all of those may be blank or
omitted, which means the information is not available.

**Notes:** The files are encoded in UTF-8.  

## Keys
### `id`
`int` : two digits, the episode number.

### `original-language`
`string` : two letters, the *Pepper&Carrot pseudo-ISO-639 two letter language codes*. They are defined in [langs.json](langs.json). The language that the first version of the comic was originally written in.

#### `supporters`
`int` : digits, the sum patrons via Patreon, Liberapay, Tipeee, Paypal, Bank at episode release.

### `published`
`date` : YYYY-MM-DD, the Publication date.

### `pluxmlID`
`int` digits, the article ID of the related blog-post on www.davidrevoy.com. URL format: `https://www.davidrevoy.com/article<digits>/#comments`

### `background-color`
`string` hex color code, the background color for the page to match the webcomic.

### `credits`
`{ string(role): ["Name <URL>", "Name <URL>"], string(role): ["Name <URL>", "Name <URL>"] }` A table with the global Credits contributions for the episode. Specific translation to a lang can be found on a info.json files inside the `lang/<langcode>` subdirectory.

### `software`
`[ {string: string} ]` List of software used in episode production. The list entries are maps that
contain at least the key `name`, and may contain a `version`.

### `notes`
`[ {string: string} ]` (Optional). List of eventual notes specific to the episode.
