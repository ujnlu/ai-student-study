# Generating Transcripts

As an optional feature, translators can provide transcripts of Pepper&Carrot episodes to the website.
We have created some scripts to automate this as much as possible.
However, you will still need to check the results and do some manual edits
where the number and order of text objects doesn't match the original.


## What you need

* [Python 3](https://www.python.org/downloads/) for running the scripts.
  If this is too complicated for you, we also have a
  [CI pipeline job](#generating-files-with-gitlab)
  that you can run instead.
* A good plain-text editor for editing the transcripts.
  For example, [Geany](https://www.geany.org/) is available for all desktop computers.
  For Windows, [Notepad++](https://notepad-plus-plus.org/) is also quite popular.


## Workflow

These are the steps for generating and curating transcripts:

1. [Extract an episode's translations](#extracting-text-from-svg-files-to-markdown) to Markdown (`*.md` file)
2. [Generate html files](#generating-html-snippets-from-markdown) for the episode's translation
3. Check html in browser and compare with webcomic page. 
   If something's wrong, [edit the Markdown manually](#curating-the-transcripts) and continue at 2.
4. If you are satisfied, `git commit` the Markdown files only.
   HTML snippets are a temporary resource and are hidden from Git.


## Extracting Text from SVG Files to Markdown

In this step, you will generate a Markdown file with annotated text for an episode's translations.
The translations will be enriched with information about who is speaking, and 
there will also be some formatting controls available to you.

Run the following Python command from the `webcomics` base folder:
```
0_transcripts/extract_text.py <episode> <locale>
```

For example,
```
0_transcripts/extract_text.py ep01_Potion-of-Flight fr
```

will generate an annotated transcript for the French translation of Episode 1.

If you don't have Python available, see 
[Generating Files with GitLab](#generating-files-with-gitlab) on generating the files.


## Generating HTML Snippets from Markdown

In this step, you will turn the annotated translations in the Markdown file for an
episode's translation into HTML snippets that will be integrated into the website.

Run the following Python command from the `webcomics` base folder:
```
0_transcripts/extract_to_html.py <episode> <locale>
```

For example,
```
0_transcripts/extract_to_html.py ep01_Potion-of-Flight fr
```

will generate all HTML snippets for the French translation of Episode 1.

If you don't have Python available, see 
[Generating Files with GitLab](#generating-files-with-gitlab) on generating the files.


## Curating the Transcripts

### Process

Open the episode that you are working on in your browser, then open the generated
HTML files one by one in a separate browser tab and compare their contents with the webcomic's pages. If
something's wrong, open the episode's Markdown file, edit it as explained below, 
[Generate the html](#generating-html-snippets-from-markdown) again and reload the HTML
snippet in your browser to check the updated version.

The first time you generate the Markdown, we use the `en` locale's files for reference.
So, if your number and order of text objects is identical to the English version,
you will not need to fix anything.
Once you have generated your translation's file, it  will become the new 
reference for the text extraction instead.

We also use .po files in [translation-names-references](../1_translation-names-references) folder for translating Speaker's names.
If you see any English for a Speaker's name in the result, it means that you are
missing a translation in `XX.po`.
Add your translation there, then run the extraction script again to get the names
translated automatically.


### File Format

#### File Header

The Markdown files start with a title and a *Notes* section, followed by a *Pages* section,
like this:

```markdown
# Transcript of Pepper&Carrot Episode 01 [en]

## Notes

Any text you like.

In as many paragraphs as you like.

## Pages

### P00

Name|Position|Concatenate|Text|Whitespace (Optional)
----|--------|-----------|----|---------------------
Title|1|False|Episode 1: The Potion of Flight

### P01
...
```

Do not edit any of the titles! You can make any change you like within the *Notes* 
section though, it will be remembered as long as you don't change the title.

#### Pages

For every text object found in the SVG, there will be a line in the Markdown file.
It is very important that you **do not change the order or number of lines** in the
Markdown file, because we need to keep this stable in case you want to enhance your
translation at a later point in time.

Each entry in a page's table has 4-5 columns, separated by `|`:

| Speaker | Order | Combine | Text | Whitespace (Optional) |
| ------- | ----- | ------- | ---- | ---------- |
| The person speaking, or `Narrator`, `Note`, `Credits` etc. Use `<hidden>` if you wish to hide the row, e.g. if it contains translators' instructions. | The sequential order that this text segment should get in the generated HTML snippet. We need this because we can't easily control the text order in the SVG files. | If `True`, the text segment following this one will be added to the end of this one. `False` if you don't want to combine anything. | The extracted text. **Do not edit**. | `nowhitespace` if you wish to suppress whitespace, e.g. for sounds that can be assembled from multiple segments. For normal text, don't add this column. |

For example, if we have a Markdown table like this:

    Sound|4|True|Glup
    Sound|5|True|Glup
    Sound|6|False|Glup
    Writing|1|True|WARNING
    Writing|3|False|PROPERTY
    Writing|2|True|WITCH

The 3 "Writing" segments on the bottom will be combined in the correct order, 
and the 3 "Sound" segments are also combined:

    Writing
        WARNING WITCH PROPERTY
    Sound
        Glup Glup Glup

And this is how to get rid of unwanted whitespace:

    Sound|1|True|s
    Sound|2|True|pl|nowhitespace
    Sound|3|True|up|nowhitespace
    Sound|4|True|g
    Sound|5|True|l|nowhitespace
    Sound|6|False|up ! !|nowhitespace
    Sound|7|False|B Z Z Z I IO O|nowhitespace

Will result in:

    Sound 
        splup glup!!
        BZZZIIOO

If your text contains any `|`, it will be escaped using `\|`.

## Generating Files with GitLab

We recommend generating the files yourself with Python, because it will save you time.
If you can't do that, you can let GitLab generate the files for you:

1. In the [webcomics GitLab repository](https://framagit.org/peppercarrot/webcomics/), click on 
   [CI / CD](https://framagit.org/peppercarrot/webcomics/pipelines)
2. Find the entry for your branch that has the "latest" label. 
   If you don't have a branch yet, use the "master" branch.
3. Click on the branch's button in the "Status" column
4. If you are starting a new transcript, run the "all-transcripts" job in the 
   "Generate" stage. This will generate Markdown and HTML files for all episodes and languages.
   If you have created your `*.md` files already, you can skip this step.
5. If you are starting a new transcript, click on the "all-transcripts" button from the "Generate" stage.
   If your branch has your Markdown files already, click on the "transcripts" button from the "Test" stage instead.
6. You should now be seeing an execution log. Once the job has finished running, 
   you can download or browse the generated files from the "Job artifacts" on the right-hand side.

