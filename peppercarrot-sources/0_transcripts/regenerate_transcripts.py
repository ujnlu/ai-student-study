#!/usr/bin/env python3
# encoding: utf-8
#
# regenerate_transcripts.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#  SPDX-FileCopyrightText: © 2023 Andrej Ficko

import sys, os, re
from pathlib import Path
from markdown import extract_episode_number, make_transcript_filename
from extract_text import main as extract_text

"""
This is a mass transcript regeneration script.
It's used to fix the pipeline and only regenerates transcripts that already exist.

Have you translated something in your .po dictionary and now the pipeline is broken? This is the solution!

Usage: python 0_transcripts/regenerate_transcripts.py <arguments>
   (it is possible to just run script and enter arguments)

<locale> can be a 2-letter language code (such as fr or en) or an episode number.
Multiple (filter) arguments are possible and numbers can be used as range (2-12).
Defaults: languages - none | episodes - all

If you wish to regenerate all languages, add argument "all".
To force generation of non-existing transcripts, add "new".
To call Transcript-to-SVG generator before regeneration, add "svg".

Extra feature: if there is a transcript .md with wrong locale name in the translation folder,
(e.g. if it was copied from other translation), it will be converted using 'extract_custom.py'.
To only search for transcripts to fix, use argument 'conv' or 'convert'.
"""

def generate_md_svg (langdir, episode, lang_src, lang_dst, md_file, md_copy_dest):
    src_svg = [x for x in os.listdir(langdir / lang_src) if x.endswith(".svg")]
    dst_svg = [x for x in os.listdir(langdir / lang_dst) if x.endswith(".svg")]
    if not sorted(dst_svg) == sorted(src_svg):
        from transcript_to_svg import main as transcript_to_svg
        md_copy_dest.write_bytes(md_file.read_bytes())
        print("Transcript-to-SVG generation for: "+lang+" ep"+epnum)
        transcript_to_svg(["", episode, lang_src, lang_dst])

def regenerate_transcript ( langdir, lang, episode, epnum):
    default_md_path = langdir / lang / make_transcript_filename(epnum, lang)
    if os.path.exists(default_md_path):
        if not only_convert:
            if generate_svg:
                backup_md = langdir / lang / (make_transcript_filename(epnum, lang).replace(".md","_backup.md"))
                generate_md_svg(langdir, episode, lang, "en", default_md_path, backup_md)
            print ("Regenerating " + make_transcript_filename(epnum, lang))
            #os.system('python "'+os.path.dirname(scriptpath)+'/extract_text.py" '+episode+" "+lang +" > "+os.devnull)
            sys.stdout = open(os.devnull, 'w')
            extract_text(("", episode, lang))
            sys.stdout = sys.__stdout__
    elif (langdir / lang).is_dir():
        md_files = []
        for x in os.listdir(langdir / lang):
            if x.endswith("_transcript.md") and x.startswith("ep"+epnum+"_"):
                md_files.append(x)
        if len(md_files) == 1:
            md_lang = md_files[0].split("_")[1]
            if generate_svg:
                generate_md_svg(langdir, episode, lang, md_lang, (langdir / lang / md_files[0]), default_md_path)
            print ("Converting " + lang +"/"+ md_files[0] + " to "+ lang +"/"+ make_transcript_filename(epnum, lang))
            from extract_custom import main as extract_text_custom
            sys.stdout = open(os.devnull, 'w')
            extract_text_custom(("", episode, "_"+md_lang+"_", lang)) # '_fr_' like is an override for cross-dir
            sys.stdout = sys.__stdout__
            if os.path.exists(default_md_path):
                os.remove(langdir / lang / md_files[0])
            else:
                print("***Error: " +lang+"/"+ md_files[0] + " was not converted.")
        elif not md_files == []:
            print("***Error: more than 1 wrong .md file in " + str(langdir.relative_to(directory)/lang) )
        elif generate_new:
            print ("!!! Generating " + make_transcript_filename(epnum, lang))
            sys.stdout = open(os.devnull, 'w')
            extract_text(("", episode, lang))
            sys.stdout = sys.__stdout__

def is_valid_lang_name(lang: str) -> bool:
    return 2 <= len(lang) <= 3 and lang.isalpha()

scriptpath = os.path.abspath(__file__)
directory = Path(os.path.dirname(scriptpath)).parent

argv = ['']
if len(sys.argv) < 2:
    print('This is how arguments are used:')
    print('    0_transcripts/regenerate_transcripts.py <arguments>')
    print('    Arguments can be: locale, episode (number or range), "all", "new", "conv"')
    print('    all = all languages | new = also generate new | conv = only convert')
    print('    svg = generate non-existing SVG files from transcript')
    print('')
    print('For example:')
    print('    0_transcripts/regenerate_transcripts.py fr')
    print('    0_transcripts/regenerate_transcripts.py all conv 9')
    print('Or:')
    print('    0_transcripts/regenerate_transcripts.py new uk 7-11')
    print('    0_transcripts/regenerate_transcripts.py fr en de 39')
    print('    0_transcripts/regenerate_transcripts.py new es 8 16 21')
    if os.path.isabs(sys.argv[0]):
        argv = input('\n  You may now enter your arguments: ').split(" ")
    if argv == ['']:
        sys.exit(1)
else:
    argv = sys.argv[1:]

ep_filter=[]
lang_filter=[]
all_langs = False
generate_new = False
only_convert = False
generate_svg = False

for arg in argv:
    if arg.isnumeric():
        ep_filter.append(f"{int(arg):02}")
    elif re.compile(r'\d+-(\d+)').fullmatch(arg):
        arg_split = arg.split("-")
        ep_filter += list(map(lambda x: f"{x:02}", range(int(arg_split[0]), int(arg_split[1])+1)))
    elif arg.lower() == "all":
        all_langs = True
    elif arg.lower() == "new":
        generate_new = True
    elif arg.lower() == "svg":
        generate_svg = True
    elif is_valid_lang_name(arg):
        lang_filter.append(arg.lower())
    elif arg.lower() in ["conv","convert"] :
        only_convert = True
    else:
        print ('Err: Argument "'+arg+'" is not recognized. (Typo?)')
if lang_filter == [] and len(ep_filter) == 1:
    all_langs = True

for episode in sorted(os.listdir(directory)):
    if episode.startswith("ep") or episode.startswith("new-ep"):
        epnum = extract_episode_number(episode)
        if not ep_filter or epnum in ep_filter:
            langdir = directory / episode / "lang"
            if all_langs:
                for lang in os.listdir(langdir):
                    regenerate_transcript(langdir, lang, episode, epnum)
            else:
                for lang in lang_filter:
                    regenerate_transcript(langdir, lang, episode, epnum)

if os.path.isabs(sys.argv[0]):
    input('\n    Done! Press Enter to end... ')
