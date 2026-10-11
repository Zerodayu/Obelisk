"""Dependency-free PNG matrix export using a small embedded bitmap font."""
import struct
import zlib

FONT = dict(zip('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-./% ', [
 '01110100011000111111100011000110001','11110100011000111110100011000111110',
 '01111100001000010000100001000001111','11110100011000110001100011000111110',
 '11111100001000011110100001000011111','11111100001000011110100001000010000',
 '01111100001000010111100011000101111','10001100011000111111100011000110001',
 '11111001000010000100001000010011111','00111000100001000010000101001001100',
 '10001100101010011000101001001010001','10000100001000010000100001000011111',
 '10001110111010110101100011000110001','10001110011010110011100011000110001',
 '01110100011000110001100011000101110','11110100011000111110100001000010000',
 '01110100011000110001101011001001101','11110100011000111110101001001010001',
 '01111100001000001110000010000111110','11111001000010000100001000010000100',
 '10001100011000110001100011000101110','10001100011000110001100010101000100',
 '10001100011000110101101011101110001','10001100010101000100010101000110001',
 '10001100010101000100001000010000100','11111000010001000100010001000011111',
 '01110100011001110101110011000101110','00100011000010000100001000010001110',
 '01110100010000100010001000100011111','11110000010000101110000010000111110',
 '00010001100101010010111110001000010','11111100001000011110000010000111110',
 '01110100001000011110100011000101110','11111000010001000100010000100001000',
 '01110100011000101110100011000101110','01110100011000101111000010000101110',
 '00000001000010000000001000010000000','00000000000000011111000000000000000',
 '00000000000000000000000000011000110','00001000100001000100010000100010000',
 '11001110100010001000010101001100000','00000000000000000000000000000000000']))


def render(path, title, counts, evaluated, missing, accuracy):
    width, height = 1100, 700
    pixels = bytearray(bytes((15, 23, 42)) * width * height)
    def rect(x, y, w, h, color):
        for row in range(max(0, y), min(height, y + h)):
            start = (row * width + max(0, x)) * 3
            stop = (row * width + min(width, x + w)) * 3
            pixels[start:stop] = bytes(color) * ((stop - start) // 3)
    def text(x, y, value, scale=3, color=(235, 242, 250)):
        for char in str(value).upper():
            glyph = FONT.get(char, FONT[' '])
            for r in range(7):
                for c in range(5):
                    if glyph[r * 5 + c] == '1': rect(x + c * scale, y + r * scale, scale, scale, color)
            x += 6 * scale
    text(30, 25, title, 4)
    text(30, 65, 'ACTUAL GEMINI PREDICTIONS - SYNTHETIC DATA', 3)
    text(350, 118, 'PREDICTED', 4)
    text(335, 164, 'AT RISK', 3); text(695, 164, 'NOT AT RISK', 3)
    text(30, 265, 'ACTUAL', 3); text(30, 300, 'AT RISK', 3)
    text(30, 430, 'ACTUAL', 3); text(30, 465, 'NOT AT RISK', 3)
    cells = [(260, 210, 'TP', counts['tp'], (20, 83, 45)), (635, 210, 'FN', counts['fn'], (127, 29, 29)),
             (260, 390, 'FP', counts['fp'], (127, 29, 29)), (635, 390, 'TN', counts['tn'], (20, 83, 45))]
    for x, y, label, count, color in cells:
        rect(x, y, 340, 160, color); text(x + 20, y + 15, label, 4); text(x + 135, y + 65, count, 7)
    text(30, 585, f'EVALUATED: {evaluated}   MISSING: {missing}', 3)
    text(30, 620, f'ACCURACY: {accuracy * 100:.2f}%' if accuracy is not None else 'ACCURACY: UNDEFINED', 3)
    text(30, 655, 'POSITIVE CLASS: AT RISK. ONE WORKBOOK ONLY.', 3)
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
    scan = b''.join(b'\0' + pixels[r * width * 3:(r + 1) * width * 3] for r in range(height))
    result = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 2, 0, 0, 0))
    result += chunk(b'IDAT', zlib.compress(scan)) + chunk(b'IEND', b'')
    with path.open('xb') as handle: handle.write(result)
