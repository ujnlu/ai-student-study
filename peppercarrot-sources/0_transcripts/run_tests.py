#!/usr/bin/env python3
# encoding: utf-8
#
#  run_tests.py
#
#  SPDX-License-Identifier: GPL-3.0-or-later
#
#  Copyright 2019 GunChleoc <fios@foramnagaidhlig.net>
#

from extract_text import *
import unittest


class TestExtractText(unittest.TestCase):

    directory = ''

    @classmethod
    def setUpClass(self):
        self.directory = os.path.join(
            os.path.dirname(
                os.path.abspath(__file__)),
            'test')

    def test_specialchars(self):
        """Test that special characters won't destroy the table structure."""
        print('\n\n*** Testing specialchars.svg')
        page = '00'
        reference_transcript = read_transcript(
            Path(self.directory + '/ep00_en_transcript.md'))
        self.assertEqual(reference_transcript['errors'], 0)

        extracted = {}
        extracted[page] = extract_text_from_page(
            self.directory, page, 'specialchars.svg', {}, reference_transcript['transcript'])
        notes = read_notes(self.directory, None)
        # Write to file
        write_transcript(page, 'en', Path(self.directory), extracted, notes)
        # Read and compare
        transcript = read_transcript(
            Path(self.directory + '/ep00_en_transcript.md'))
        expected_string = 'Test that \| won\'t crash the algorithm. Let\'s also have some " quotes.'
        self.assertEqual(transcript['errors'], 0)
        self.assertEqual(transcript['transcript'][page][0][3], expected_string)

    def test_translation(self):
        """Test fetching of names translation."""
        print('\n\n*** Testing Title Translation')
        page = '00'
        # Delete file if it exists to get a clean slate
        transcript_path = Path(self.directory + '/ep00_gd_transcript.md')
        if transcript_path.exists():
            os.remove(transcript_path.as_posix())

        # Get references
        reference_transcript = read_transcript(
            Path(self.directory + '/ep00_en_transcript.md'))
        self.assertEqual(reference_transcript['errors'], 0)

        names = read_dictionary(
            Path(self.directory).parent.parent.as_posix(), 'gd')

        extracted = {}
        extracted[page] = extract_text_from_page(
            self.directory, page, 'specialchars.svg', names, reference_transcript['transcript'])
        notes = read_notes(self.directory, None)
        # Write to file
        write_transcript(page, 'gd', Path(self.directory), extracted, notes)
        # Read and compare
        transcript = read_transcript(transcript_path)
        self.assertEqual(transcript['errors'], 0)
        self.assertEqual(transcript['transcript'][page][0][0], 'Tiotal')


if __name__ == '__main__':
    print('######################')
    print('# Running Unit Tests #')
    print('######################')
    unittest.main()
