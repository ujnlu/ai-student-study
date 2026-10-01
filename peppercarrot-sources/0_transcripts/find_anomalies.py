#!/usr/bin/env python3
# encoding: utf-8
#
# find_anomalies.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#  SPDX-FileCopyrightText: © 2023 Andrej Ficko

import os
from pathlib import Path
import sys
from extract_text import read_reference, read_dictionary
from markdown import extract_episode_number, make_transcript_filename, read_transcript
import json

orig_langs = ['en','fr'] #language to compare on folder structure check, tries the first one that exists
"""
This script looks for anomalies of 4 types: (you can use lang code as argument)
1. Compares episode filenames for each language with the English ones.
   - .gitkeep happens when you create a folder using the GitLab GUI (to preserve empty folder) and can be deleted.
   - readme is an agreed name for notes, .txt or .md.
   Note: .gitignore setting is not included

2. Compares speaker names in the transcript to the .po dictionary file for that language. (<hidden> is ignored)
   There are 3 known ways this can happen:
   - The name translation is updated in the dictionary: the script can only update it if it was in English.
   - The translator translated the name manually, but didn't add it to the dictionary.
   - A typo or an extra text field marked as <unknown>.
   There is a possibility of new 'multiple-speaker' combination, see line 104 and extend it.

3. Checks the xlink:href of every .svg file to match the .svg filename and if exists in lang folder.

4. Tries to read all existing .md files as an HTML generator and prints any errors it encounters.
"""

# from https://svn.blender.org/svnroot/bf-blender/trunk/blender/build_files/scons/tools/bcolors.py
class bcolors:
    if os.name == 'posix': # only works on Linux
        HEADER = '\033[95m'
        OKBLUE = '\033[94m'
        OKCYAN = '\033[96m'
        OKGREEN = '\033[92m'
        WARNING = '\033[93m'
        FAIL = '\033[91m'
        ENDC = '\033[0m'
        BOLD = '\033[1m'
        UNDERLINE = '\033[4m'
    else:
        HEADER, OKBLUE, OKCYAN, OKGREEN, WARNING, FAIL, ENDC, BOLD, UNDERLINE = '','','','','','','','',''

def try_read_json(langdir, lang, file="info.json"):
    target = langdir / lang / file
    if target.exists():
        with open(target, 'r') as f:
            try:
                return json.load(f)
            except json.decoder.JSONDecodeError as error:
                print('JSON err: '+epnum+lang+"; "+ error)

scriptpath = os.path.abspath(__file__)
directory = Path(os.path.dirname(scriptpath)).parent
lang_codes = []
with open(directory / 'langs.json', 'r', encoding="utf-8") as json_file:
    lang_codes = list(json.load(json_file).keys())
dirlist = []
if len(sys.argv) > 1:
    if not sys.argv[1] in lang_codes:
        print ("**** Error: There is no '" + bcolors.FAIL + sys.argv[1] + bcolors.ENDC + "' as language code in langs.json.")
        sys.exit()
    dirlist = [sys.argv[1], '_.png']

missing = ""
print ("\n" + bcolors.BOLD + "Searching for anomalies in the folder structure:" + bcolors.ENDC)
for episode in sorted(os.listdir(directory)):
    if episode.startswith("ep") or episode.startswith("new-ep"):
        epnum = extract_episode_number(episode)
        langdir = directory / episode / 'lang'
        for orig_lang in orig_langs:
            if (langdir/orig_lang).exists():
                break
        endirlist=os.listdir(langdir / orig_lang)
        if not len(dirlist) == 2:
            dirlist = os.listdir(langdir)
        elif not os.path.isdir(langdir / dirlist[0]):
            continue
        for lang in dirlist:
            if not lang.endswith(".png"):
                if lang in lang_codes:
                    reference_dirlist=list(map(lambda x: x.replace(make_transcript_filename(epnum, orig_lang), make_transcript_filename(epnum, lang)), endirlist))
                    local_dirlist = os.listdir(langdir / lang)
                    for l_file in local_dirlist:
                        if l_file not in reference_dirlist:
                            notify_color=bcolors.WARNING
                            if l_file == ".gitkeep":
                                notify_color=bcolors.OKCYAN
                            elif "readme." in l_file.lower():
                                notify_color=bcolors.OKGREEN
                            print(episode+"/lang/"+lang+"/"+ notify_color + l_file + bcolors.ENDC)
                        if l_file == "info.json" and lang not in ["en","fr"]:
                            lang_json = try_read_json(langdir, lang)
                            fr_json = try_read_json(langdir, "fr")
                            en_json = try_read_json(langdir, "en")
                            if lang_json == en_json:
                                missing +="\n*"+ episode+"/lang/"+lang+"/"+ bcolors.FAIL + l_file + bcolors.ENDC +" (EN copy)"
                            if lang_json == fr_json:
                                missing +="\n*"+ episode+"/lang/"+lang+"/"+ bcolors.FAIL + l_file + bcolors.ENDC +" (FR copy)"
                    for r_file in reference_dirlist:
                        if r_file not in local_dirlist:
                            if not r_file.endswith(".md"):
                                missing +="\n"+ episode+"/lang/"+lang+"/"+ bcolors.WARNING + r_file + bcolors.ENDC
                else:
                    print(episode+"/lang/"+ bcolors.WARNING + lang + bcolors.ENDC)

if missing:
    print("\n" + bcolors.BOLD + "Detected missing necessary files:" + bcolors.ENDC + missing)

print ("\n" + bcolors.BOLD + "Searching for anomalies in transcript (speaker) names:" + bcolors.ENDC)
dic_list = {}
for episode in sorted(os.listdir(directory)):
    if episode.startswith("ep") or episode.startswith("new-ep"):
        epnum = extract_episode_number(episode)
        langdir = directory / episode / 'lang'
        if not len(dirlist) == 2:
            dirlist = os.listdir(langdir)
        for lang in dirlist:
            if (langdir / lang).is_dir():
                if os.path.exists(langdir / lang / make_transcript_filename(epnum, lang) ):
                    sys.stdout = open(os.devnull, 'w')
                    refm = read_reference(langdir, lang, epnum)
                    dic_local = dic_list.get(lang)
                    if not dic_local:
                        dicm = read_dictionary(directory.as_posix(), lang)
                        dic_local = list(dicm.values())
                        dic_local += ["<hidden>", \
                            dicm['Saffron']+" "+dicm['&']+" "+dicm['Pepper'], \
                            dicm['Shichimi']+" "+dicm['&']+" "+dicm['Coriander'], \
                            dicm['Pepper']+" "+dicm['&']+" "+dicm['Shichimi'], \
                            dicm['Spirulina']+" "+dicm['&']+" "+dicm['Durian']]
                        dic_list[lang]=dic_local
                    sys.stdout = sys.__stdout__
                    for ref1 in refm['contents']:
                        for ref2 in refm['contents'][ref1]:
                            if ref2[0] not in dic_local:
                                dic_local.append(ref2[0])
                                print (epnum+" "+lang+": "+ref2[0])

print ("\n" + bcolors.BOLD + "Searching for anomalies in 'misc' folder structure:" + bcolors.ENDC)
for episode in sorted(os.listdir(directory / "misc")):
    langdir = directory / "misc" / episode / 'lang'
    for orig_lang in orig_langs:
        if (langdir/orig_lang).exists():
            break
    endirlist=os.listdir(langdir / orig_lang)
    if not len(dirlist) == 2:
        dirlist = os.listdir(langdir)
    elif not os.path.isdir(langdir / dirlist[0]):
        continue
    for lang in dirlist:
        if os.path.isdir(langdir / lang):
            if lang in lang_codes:
                reference_dirlist=endirlist
                local_dirlist = os.listdir(langdir / lang)
                for l_file in local_dirlist:
                    if l_file not in reference_dirlist:
                        notify_color=bcolors.WARNING
                        if l_file == ".gitkeep":
                            notify_color=bcolors.OKCYAN
                        elif "readme." in l_file.lower():
                            notify_color=bcolors.OKGREEN
                        print(episode+"/lang/"+lang+"/"+ notify_color + l_file + bcolors.ENDC)
                    if l_file == "info.json":
                        try_read_json(langdir, lang)
                for r_file in reference_dirlist:
                    if r_file not in local_dirlist:
                        if not r_file.endswith(".md"):
                            print(bcolors.WARNING+"Missing: "+bcolors.ENDC+ episode+"/lang/"+lang+"/"+ bcolors.WARNING+ r_file +bcolors.ENDC)
            else:
                print(episode+"/lang/"+ bcolors.WARNING + lang + bcolors.ENDC)

print ("\n" + bcolors.BOLD + "Searching for anomalies in SVG artwork xlink:href:" + bcolors.ENDC + " (takes some time)")
for episode in sorted(os.listdir(directory)):
    if episode.startswith("ep") or episode.startswith("new-ep"):
        langdir = directory / episode / 'lang'
        if not len(dirlist) == 2:
            dirlist = os.listdir(langdir)
        elif not os.path.isdir(langdir / dirlist[0]):
            continue
        for lang in dirlist:
            if (langdir / lang).is_dir():
                for l_file in os.listdir(langdir / lang):
                    if l_file.endswith(".svg"):
                        with open(langdir / lang / l_file, 'r', encoding="utf-8") as svg_file:
                            svg_data = svg_file.read()
                            svg_href_loc = svg_data.find('xlink:href=".')
                            href_link = svg_data[svg_href_loc: svg_data.find('"\n',svg_href_loc)].strip('xlink:href="../')
                            if (l_file.strip(".svg") not in href_link or not os.path.exists(langdir / href_link)) and not href_link == "":
                                print (lang, l_file, href_link)

from combined_html_generator import extract_page_to_html
print ("\n" + bcolors.BOLD + "Searching for errors in transcript when generating HTML:" + bcolors.ENDC)
for episode in sorted(os.listdir(directory)):
    if episode.startswith("ep") or episode.startswith("new-ep"):
        langdir = directory / episode / "lang"
        if not len(dirlist) == 2:
            dirlist = os.listdir(langdir)
        for lang in dirlist:
            if (langdir / lang).is_dir():
                epnum = extract_episode_number(episode)
                TRANSCRIPT_PATH = langdir / lang / make_transcript_filename(epnum, lang)
                if os.path.exists(TRANSCRIPT_PATH):
                    sys.stdout = open(os.devnull, 'w')
                    TRANSCRIPT = read_transcript(TRANSCRIPT_PATH)
                    sys.stdout = sys.__stdout__
                    for page in TRANSCRIPT['transcript']:
                        page_html = extract_page_to_html(TRANSCRIPT['transcript'][page], page, lang.upper()+": E"+epnum+" P"+page)

if os.path.isabs(sys.argv[0]):
    input('\n    Done! Press Enter to end... ')
