#!/usr/bin/env python3
# encoding: utf-8
#
#  combined_html_generator.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#
#  Copyright 2019-2020 GunChleoc <fios@foramnagaidhlig.net>
#  Copyright 2023 Andrej Ficko
#

import html
import os.path
from pathlib import Path
import sys, re, json
from markdown import extract_episode_number, make_transcript_filename, read_transcript
from extract_text import read_reference, read_dictionary, extract_text_from_page
from svg import read_svg

"""
This script generates combined HTML for whole language or episode.
It was ment to help translators with spell checking, so they can copy the whole text. (e.g. Libre Office)
As the output messages are minimised, it can be convenient to check for transcription errors in your language.

The default output directory is 0_transcripts/lang/html/ as it is ignored by git, attribute 2 to override it.
It will read existing Mardown transcript files, and if they don't exist,
the text will be extracted from .svg's using the transcript generation function.
"""

# Based on extract_to_html.py from GunChleoc
def extract_page_to_html(TRANSCRIPT, page, diag):
    ERRORS = 0
    # Read page contents and assign sort order
    raw_rows = {}
    for row in TRANSCRIPT:
        if row[0] == '<hidden>':
            # Translators' instructions etc., we don't want them in the transcript
            continue
        key = int(row[1])
        if key in raw_rows.keys():
            print(diag+' **** ERROR1: On page ' + page +
                ', DUPLICATE POSITION ' + str(key) + '! Rows:\n**** \t' +
                '|'.join(row) + '\n**** \t' + '|'.join(raw_rows[key]) + ' ****',
                file=sys.stderr)
            ERRORS = ERRORS + 1
        raw_rows[key] = row

    # Combine data into nodes - for rows that contain "True",
    # the following row ends up in the same entry
    entries = []
    current_rows = []
    row = []

    # Ensure we don't accidentally skip the final row
    last_row_key = sorted(raw_rows.keys())[-1]
    if raw_rows[last_row_key][2] == 'True':
        print(diag+' **** ERROR2: Last row bypassed; must be |False| in ' + '|'.join(raw_rows[last_row_key]) + ' ****', file=sys.stderr)
        ERRORS = ERRORS + 1
        raw_rows[last_row_key][2] = 'False'

    for key in sorted(raw_rows.keys()):
        row = raw_rows[key]
        current_rows.append(row)

        if row[2] == 'False':
            entries.append(current_rows)
            current_rows = []

    # Now generate the HTML code
    contents = '<dl>'
    title = ''
    for entry in entries:
        text = ''
        if entry:
            # Add title whenever somebody else starts speaking/making a noise etc.
            if entry[0][0] != title:
                title = entry[0][0]
                contents = contents + '<dt><strong>' + \
                    html.escape(title) + '</strong></dt>\n'

            # Assemble rows for this entry
            for row in entry:
                # Catch obvious bugs with True/False assignment
                if title != row[0]:
                    print(diag+" **** ERROR3: Title '" +
                        row[0] + "' On page " + page +
                        " does not match previous title '" + title + "' for " +
                        '|'.join(row) + ' ****', file=sys.stderr)
                    ERRORS = ERRORS + 1
                # Catch rows that lack a speaker
                if row[0] == '<unknown>':
                    print(diag+' **** ERROR4: On page ' + page +
                        ', please assign a speaker for ' +
                        '|'.join(row) + ' ****', file=sys.stderr)
                    ERRORS = ERRORS + 1

                # Add current row to output text
                if len(row) > 4 and row[4] == 'nowhitespace':
                    # Assembled sounds, bird tweetings etc. don't get blank spaces
                    text = text + row[3].replace(' ', '')
                else:
                    text = text + ' ' + row[3]

                # No more rows will be combined into this output text line,
                # let's add the line and start a fresh one
                if row[2] == 'False':
                    contents = contents + '    <dd>' + \
                        html.escape(text.strip()) + '</dd>\n'
                    text = ''
    return contents + '</dl>'


def generate_episode_html ( langdir, lang, episode):
    if not os.path.exists(langdir / lang):
        return ""
    epnum = extract_episode_number(episode)
    TRANSCRIPT_PATH = langdir / lang / make_transcript_filename(epnum, lang)
    TRANSCRIPT = {'transcript':{}}
    if os.path.exists(TRANSCRIPT_PATH):
        TRANSCRIPT = read_transcript(TRANSCRIPT_PATH)
    else:
        sys.stdout = open(os.devnull, 'w')
        names = read_dictionary(directory.as_posix(), lang)
        reference_transcript = read_reference(langdir, lang, epnum)
        pagefile_regex = re.compile(r'E\d+P(\d+)\.svg')

        for filename in sorted((langdir/lang).iterdir()):
            match = pagefile_regex.fullmatch(filename.name)
            if match and len(match.groups()) == 1:
                pagenumber = match.groups()[0]
                print('Extracting texts from ' + filename.name)
                rows = extract_text_from_page(
                    (langdir/lang).as_posix(),
                    pagenumber,
                    filename.name,
                    names,
                    reference_transcript['contents'])
                if rows:
                    TRANSCRIPT['transcript'][pagenumber]=[]
                    for row in rows:
                        TRANSCRIPT['transcript'][pagenumber].append(row.split("|"))
        sys.stdout = sys.__stdout__

    transcript_html = ""
    for page in TRANSCRIPT['transcript']:
        page_html = extract_page_to_html(TRANSCRIPT['transcript'][page], page, lang.upper()+": E"+epnum+" P"+page)
        page_html=page_html.replace("</dd>\n    <dd>","\n  <br> - ")
        if not page == "00":
            page_html = "<h4>" + lang.upper()+": E"+epnum+" P"+page+ "</h4>\n" + page_html
        else:
            title_found=re.findall(r"<strong>.*</strong>",page_html)
            page_html=page_html.replace(title_found[0],"").replace("<dl>","<h1>").replace("</dl>","</h1>\n").replace("<dt>"," | ").replace("</dd>","").replace("<h1> | ","<h1>")
        transcript_html+=page_html

    # This part from older version of my script just works and I prefer not to touch it ;)
    transcript_html=transcript_html.replace("<strong>","<strong>&lt;").replace("</strong>","&gt;</strong>")
    transcript_html=transcript_html.replace("<dl>","<table><tr><td>").replace("</dl>","</td></tr></table>\n").replace("<dd>","").replace("</dt>","")
    transcript_html=transcript_html.replace("<dt>","</td></tr><tr><td>").replace("</dd>","").replace("<tr><td></td></tr>","")
    return transcript_html.replace("&lt;&lt;unknown&gt;&gt;","&lt;unknown!&gt;")


def bundle_lang_html (lang, ep_filter):
    html_output = ""
    for episode in sorted(os.listdir(directory)):
        if episode.startswith("ep") or episode.startswith("new-ep"):
            epnum = extract_episode_number(episode)
            if not ep_filter or epnum in ep_filter:
                langdir = directory / episode / "lang"
                html_output += generate_episode_html(langdir, lang, episode)
    return html_output


def write_html (html_output, file_name, destdirectory): #file_name without .html
    if html_output:
        html_output = "<style>table, th, td {border: 1px solid; width:100%;} body{font-family: 'ubuntu, arial, sans-serif';}</style>\n" + html_output
        html_file = destdirectory / (file_name+".html")
        with open(html_file, 'w', encoding='utf-8', newline='\n') as f:
            f.write(html_output)
        print('HTML written to ' + str(html_file))


def is_valid_lang_name(lang: str) -> bool:
    return 2 <= len(lang) <= 3 and lang.isalpha()

def main(argv):

    print('######################################################################')
    print('#  Tool for bundle converting extracted texts from Markdown to HTML  #')
    print('######################################################################\n')

    if len(argv) == 2: # make drag&drop work (check and extract data from absolute path)
        input_path = Path(os.path.abspath(argv[1])).resolve() # resolves hyperlink path, just like in scriptpath
        if str(directory) in str(input_path):
            input_relative = input_path.relative_to(directory).parts # [episode, "lang", locale, *]
            if len(input_relative) >= 3 and extract_episode_number(input_relative[0]):
                if input_relative[1] == 'lang' and is_valid_lang_name(input_relative[2]):
                    argv = argv[:1] + [extract_episode_number(input_relative[0]), input_relative[2], "svg"] # replacing arguments

    args = ['']
    if len(argv) < 2:
        print('This is how arguments are used:')
        print('    0_transcripts/combined_html_generator.py <arguments in any order> <destination directory(optional,absolute path)>')
        print('')
        print('    Arguments can be: locale, episode (number or range), "all", "bundle", "svg"')
        print("    'all' uses all languages, 'bundle' combines each language to a single file")
        print("    'svg' sets <destination dir.> among svg files (incompatible with 'bundle')")
        print("    (Default <destination directory> is 'webcomics/0_transcripts/lang/html/')")
        print('')
        print('Example arguments:')
        print('    0_transcripts/combined_html_generator.py fr')
        print('    0_transcripts/combined_html_generator.py mx 7-11 13')
        print('    0_transcripts/combined_html_generator.py all (this will take time)')
        print('Or:')
        print('    0_transcripts/combined_html_generator.py bundle eo 2-6 28-32 ')
        print('    0_transcripts/combined_html_generator.py es 38 svg')
        print('    0_transcripts/combined_html_generator.py mx ls 6 2-4 svg')
        print('')
        print('Destination directory must be last (more than 8 characters & absolute path)')
        print('    0_transcripts/combined_html_generator.py all /destination/path/of/your/choice')
        if os.path.isabs(argv[0]):
            args = input('\n  You may now enter your arguments (e.g. es 06): ').split(" ")
        if args == ['']:
            sys.exit(1)
    else:
        args = argv[1:]
    destdirectory = Path(os.path.dirname(scriptpath)) / "lang" / "html"

    ep_filter=[]
    lang_filter=[]
    all_langs = False
    bundle_flag = False
    svg_output = False

    for arg in args:
        if arg.isnumeric():
            ep_filter.append(f"{int(arg):02}")
        elif re.compile(r'\d+-(\d+)').fullmatch(arg):
            arg_split = arg.split("-")
            ep_filter += list(map(lambda x: f"{x:02}", range(int(arg_split[0]), int(arg_split[1])+1)))
        elif arg.lower() == "svg":
            svg_output = True
        elif arg.lower() == "all":
            all_langs = True
        elif arg.lower() == "bundle":
            bundle_flag = True
        elif is_valid_lang_name(arg):
            lang_filter.append(arg.lower())
        elif len(arg) > 8 and arg == args[-1]:
            destdirectory = Path(arg)
            print('==> Debug, destination path found:\n', destdirectory, "\n")
            #print('Source directory:', directory)
        else:
            print ('Err: Argument "'+arg+'" is not recognized. (Typo?)')

    if not os.path.isdir(destdirectory):
        os.makedirs(destdirectory)

    if all_langs:
        with open(directory / 'langs.json', 'r', encoding="utf-8") as json_file:
            lang_filter=sorted(json.load(json_file).keys())

    if bundle_flag:
        for lang in lang_filter:
            html_output = bundle_lang_html(lang, ep_filter)
            write_html(html_output, lang+"_misc", destdirectory)

    elif not ep_filter: # take all ep if filter empty
        for lang in lang_filter:
            html_output = bundle_lang_html(lang, ep_filter)
            write_html(html_output, lang+"_all", destdirectory)

    elif lang_filter == [] and len(ep_filter) == 1: # 1 EP all langs
        html_output = ""
        for episode in sorted(os.listdir(directory)):
            if episode.startswith("ep") or episode.startswith("new-ep"):
                if extract_episode_number(episode) == ep_filter[0]:
                    langdir = directory / episode / "lang"
                    for lang in os.listdir(langdir):
                        if (langdir / lang).is_dir():
                            html_output += generate_episode_html(langdir, lang, episode)
                    write_html(html_output, ep_filter[0]+"_all", destdirectory)

    else: # create individual output files based on filter
        for episode in sorted(os.listdir(directory)):
            if episode.startswith("ep") or episode.startswith("new-ep"):
                epnum = extract_episode_number(episode)
                if epnum in ep_filter:
                    langdir = directory / episode / "lang"
                    for lang in lang_filter:
                        html_output = generate_episode_html(langdir, lang, episode)
                        if svg_output:
                            write_html(html_output, lang+"_"+epnum, langdir / lang)
                        else:
                            write_html(html_output, lang+"_"+epnum, destdirectory)

    if os.path.isabs(argv[0]):
        input('\n    Done! Press Enter to end... ')


scriptpath = os.path.abspath(__file__)
directory = Path(os.path.dirname(scriptpath)).parent.resolve()

# Call the main function when this script is executed
if __name__ == '__main__':
    sys.exit(main(sys.argv))
