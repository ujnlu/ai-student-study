#!/usr/bin/env python3
# encoding: utf-8
#
# transcript_to_svg.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#  SPDX-FileCopyrightText: © 2024 Andrej Ficko
#  Based/adapted from scripts of: © 2019-2020 GunChleoc <fios@foramnagaidhlig.net>
try:
    import lxml.etree
except:
    print("\nYou need a library to run me. Try: 'pip install lxml'")
    sys.exit(1)
import os, sys, re, json
from pathlib import Path
from svg import format_line, check_filter, read_flowspans, read_text, g_layer_blocklist_labels, g_child_allowlist_ids
from markdown import extract_episode_number, make_transcript_filename, read_transcript
#import xml.etree.ElementTree
#xml.etree.ElementTree.register_namespace("","http://www.w3.org/2000/svg")

def font_replace(style):
    global font
    ff = font.get("family")
    if ff and not ff == "Lavi":
        #style = style.replace("font-family:Lavi","font-family:"+ff)
        #style = style.replace("-inkscape-font-specification:Lavi","-inkscape-font-specification:"+ff)
        # regex rework to work with spaces around : and accept&return '
        style = re.sub(r'font-family\s*:\s*(\'?)Lavi\'?', r'font-family:\1' + ff, style)
        style = re.sub(r'-inkscape-font-specification\s*:\s*(\'?)Lavi\'?', r'-inkscape-font-specification:\1' + ff, style)
    return style

def proces_flowroots(tag, attrib_filter = {} ):
    for flowroot in tag.findall('{http://www.w3.org/2000/svg}flowRoot'):
        line = ''
        id_found = check_filter(flowroot, attrib_filter)
        for flowpara in flowroot.findall('{http://www.w3.org/2000/svg}flowPara'):
            if not id_found and not check_filter(flowpara, attrib_filter):
                continue
            line = line + ' '
            if flowpara.text:
                line = line + flowpara.text
            # There can be nested tags
            line = line + read_flowspans(flowpara)
            # And more text after the nested tags
            if flowpara.tail:
                line = line + ' ' + flowpara.tail
        line = format_line(line)
        global count
        if line != '':
            if line != text_array[count]:
                wrote=False
                froot_style = font_replace(flowroot.attrib.get("style"))
                flowroot.set("style",froot_style)
                #print(count,line)
                for flowpara in flowroot.findall('{http://www.w3.org/2000/svg}flowPara'):
                    if not wrote:
                        flowpara.text=text_array[count]
                        wrote=True
                    else:
                        flowpara.getparent().remove(flowpara)
                    for f in flowpara:
                        f.getparent().remove(f)
            count+=1


def proces_g(tag, attrib_filter_inherited = {} ):
    for graph in tag.findall('{http://www.w3.org/2000/svg}g'):
        attrib_filter = attrib_filter_inherited
        g_label = graph.attrib.get('{http://www.inkscape.org/namespaces/inkscape}label')
        g_gm = graph.attrib.get('{http://www.inkscape.org/namespaces/inkscape}groupmode')
        if g_label in g_layer_blocklist_labels and g_gm == 'layer':
            #print ("Activated layer filter on '" + g_label + "'")
            if len(g_child_allowlist_ids) > 1:
                attrib_filter = {"id" : re.compile('|'.join(g_child_allowlist_ids) )}
            elif len(g_child_allowlist_ids) == 1:
                attrib_filter = {"id" : re.compile(g_child_allowlist_ids)}
            else:
                continue
        proces_flowroots(graph, attrib_filter)
        proces_g(graph, attrib_filter)
        for text in graph.findall('{http://www.w3.org/2000/svg}text'):
            if not check_filter(text, attrib_filter):
                continue
            line = format_line(read_text(text, attrib_filter))
            global count
            if line != '':
                if line != text_array[count]:
                    inherit_style=''
                    for f in text:
                        style=f.attrib.get("style")
                        if (style and not inherit_style):
                            inherit_style=style
                            #print(style)
                        elif not inherit_style: # lazy code copy
                            for f2 in f:
                                style=f2.attrib.get("style")
                                if (style and not inherit_style):
                                    inherit_style=style
                        f.getparent().remove(f)
                    text.text=text_array[count]
                    if not inherit_style:
                        inherit_style = 'line-height:1.25'
                    text_style = text.attrib.get("style") + ';'+inherit_style
                    text_style = font_replace(text_style)
                    text.set("style",text_style)
                count+=1


def proces_svg(filein, fileout, transcript_array, attrib_filter = {} ):
    global count
    global text_array
    count = 0
    text_array = transcript_array
    text_length = len(text_array)
    #print(text_length)
    #print(text_array)

    if not fileout.exists():
        if text_length > 0:
            tree = lxml.etree.parse(filein)
            root = tree.getroot()
            proces_flowroots(root, attrib_filter)
            proces_g(root, attrib_filter)
            print("Generating '"+fileout.name+"' with "+str(text_length)+" text entries.")
            tree.write(fileout, pretty_print=True)
        else:
            print("Transcript for '"+fileout.name+"' has no text. Ctrl+C Ctrl+V ;)")
            fileout.write_text(filein.read_text())
    else:
        print("File '"+fileout.name+"' exists, skipping.")

count = 0
text_array = []
font = {}


def read_md_file(transcript_path):
    if transcript_path.exists() and transcript_path.is_file():
        transcript = read_transcript(transcript_path)
        if transcript['errors'] > 0:
            print('-> Error while reading reference transcript! '+str(transcript_path)+' ABORTING.', file=sys.stderr)
            sys.exit(1)
        else:
            return transcript['transcript']
    else:
        print('Transcript file '+str(transcript_path)+' does not exist.')
        sys.exit(1)

def is_valid_lang_name(lang: str) -> bool:
    return 2 <= len(lang) <= 3 and lang.isalpha() and lang.islower()

def main(argv):
    scriptpath = os.path.abspath(__file__)
    directory = Path(os.path.dirname(scriptpath)).parent.resolve()

    if len(argv) == 2:
        if argv[1].count("/") == 1: # expected episode/locale - common typo on manual input
            in_arg = argv[1].split("/")
            if extract_episode_number(in_arg[0]) and is_valid_lang_name(in_arg[1]):
                argv = argv[:1] + in_arg

        else: # make drag&drop work (check and extract data from absolute path)
            input_path = Path(os.path.abspath(argv[1])).resolve() # resolves hyperlink path, just like in scriptpath
            if str(directory) in str(input_path):
                input_relative = input_path.relative_to(directory).parts # [episode, "lang", locale, *]
                if len(input_relative) >= 3 and extract_episode_number(input_relative[0]):
                    if input_relative[1] == 'lang' and is_valid_lang_name(input_relative[2]):
                        argv = argv[:1] + [input_relative[0], input_relative[2]] # replacing arguments

    if len(argv) < 3:
        print('\nWrong number of arguments! Usage:')
        print('    0_transcripts/transcript_to_svg.py <episode> <locale> <source locale>')
        print('For example:')
        print('    0_transcripts/transcript_to_svg.py ep01_Potion-of-Flight fr')
        print('Or:')
        print('    0_transcripts/transcript_to_svg.py ep01_Potion-of-Flight en fr')
        print('')
        print('Font data is read from ../langs.json for automatic font replacement.')
        print('To disable font replacement, make langs.json unreadable.')
        if os.path.isabs(argv[0]):
            input('\n     Press Enter to end... ')
        sys.exit(1)

    episode = argv[1]
    locale = argv[2]
    if len(argv) == 4:
        loc_src = argv[3]
    else:
        loc_src = 'en'
    print("Episode '" + episode + "', locale '" + locale + "', source locale '"+loc_src+"'")
    episode_number = extract_episode_number(episode)
    if episode_number == '':
        sys.exit(1)
    try:
        with open(directory / 'langs.json', 'r', encoding="utf-8") as json_file:
            global font
            font=json.load(json_file).get(locale,{}).get("font",{})
            #print(font) # {'family': 'Lavi', 'size': 36}
            font_family = font.get("family","")
            if font_family and not font_family =="Lavi":
                print("Active font replacement to: '"+font_family+"'")
    except ValueError as error:
        print('***Error fetching font: syntax error in ../langs.json:')
        print('   ', error)
    except FileNotFoundError as error:
        print('***Error fetching font: ../langs.json not found')
    except:
        print ("***Error fetching font: unknown error")

    directory = directory / episode / 'lang'
    pagefile_regex = re.compile(r'E\d+P(\d+)\.svg')

    transcript_src = read_md_file( directory / loc_src / make_transcript_filename(episode_number, loc_src) )
    transcript_dst = read_md_file( directory / locale / make_transcript_filename(episode_number, locale) )
    for filename in sorted((directory/loc_src).iterdir()):
        match = pagefile_regex.fullmatch(filename.name)
        if match and len(match.groups()) == 1:
            pagenumber = match.groups()[0]
            if len(transcript_src.get(pagenumber,'')) == len(transcript_dst.get(pagenumber,'')):
                transcript_array = list(map(lambda x: x[3], transcript_dst.get(pagenumber,[])))
                proces_svg(filename,(directory/locale/filename.name),transcript_array, {})
            else:
                print ("Page "+pagenumber+": number of entries is different. Skipping.")

#main (["","new-ep39_The-Bedtime-Story", "de", "fr"])

""" #My commands in case of debugging
tree=lxml.etree.parse("/home/fici/PnC/webcomics/0_transcripts/test/transcript-svg_extract_order.svg")
root = tree.getroot()
print(root[8][5].attrib.get("style"))
root[8][5].set("style","a")
print(root[8][5].attrib.get("style"))
text_array = ['#0 flowRoot0_ar', '#1 flowRoot1_2', '#2 text1_', '#4 flowRoot2_3', '#7 flowRoot4_4', '#6 flowRoot3_5', '#5 text3_6_', '#3 text2_', 'ignored flowRoot5_9', '#7 flowRoot4_7', '#6 flowRoot3_8', '#4 flowRoot2_0', '#0 flowRoot0_s', '#1 flowRoot1_', 'Position\\|Concat\\|Text--------\\|------\\|----0\\|False\\|#0 flowRoot0 1\\|False\\|#1 flowRoot1 2\\|False\\|#2 text1 4\\|False\\|#4 flowRoot2 7\\|False\\|#7 flowRoot4 6\\|False\\|#6 flowRoot3 5\\|False\\|#5 text3 3\\|False\\|#3 text2', 'Naslov', 'konec']
ein = "/home/fici/PnC/webcomics/0_transcripts/test/transcript-svg_extract_order.svg"
aus = "/home/fici/PnC/webcomics/0_transcripts/test/svg-tr-t3.svg"
proces_svg(ein, aus, text_array)"""

# Call main function when this script is being run
if __name__ == '__main__':
    sys.exit(main(sys.argv))
