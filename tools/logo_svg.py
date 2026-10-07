"""Pioneer logo as real SVG paths: the mark (from the app's PioneerMark) + the wordmark outlined from
Instrument Sans at weight 500 (OFL), with the font's own kerning. Writes assets/brand/pioneer-logo.svg
(horizontal lockup) and assets/brand/pioneer-mark.svg. Fill is currentColor.

Usage: python tools/logo_svg.py
"""
import re
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
MARK = re.search(r'PIONEER_MARK_PATH =\s*"([^"]+)"', (ROOT.parent / 'qoder-hackathon/src/components/ui/PioneerMark.tsx').read_text()).group(1)
OUT = ROOT / 'assets/brand'

TEXT = 'Pioneer'
MARK_SIZE = 120.0      # mark height in SVG px
CAP_RATIO = 0.68       # wordmark cap height / mark height (as in the brand scene)
GAP_RATIO = 0.26       # space between mark and word / mark height
TRACKING = -0.015      # em


def kern(font, left, right):
    """Pair adjustment from the GPOS 'kern' feature (PairPos format 1 and 2, extension lookups)."""
    gpos = font['GPOS'].table
    lookups = sorted({i for fr in gpos.FeatureList.FeatureRecord if fr.FeatureTag == 'kern' for i in fr.Feature.LookupListIndex})
    total = 0
    for li in lookups:
        lookup = gpos.LookupList.Lookup[li]
        for st in lookup.SubTable:
            if lookup.LookupType == 9:
                st = st.ExtSubTable
            if getattr(st, 'LookupType', 2) != 2 or left not in st.Coverage.glyphs:
                continue
            value = None
            if st.Format == 1:
                for rec in st.PairSet[st.Coverage.glyphs.index(left)].PairValueRecord:
                    if rec.SecondGlyph == right:
                        value = rec.Value1
                        break
                if value is None:
                    continue
            else:
                c1 = st.ClassDef1.classDefs.get(left, 0)
                c2 = st.ClassDef2.classDefs.get(right, 0)
                value = st.Class1Record[c1].Class2Record[c2].Value1
            total += (getattr(value, 'XAdvance', 0) or 0) if value is not None else 0
            break
    return total


def main():
    font = TTFont(ROOT / 'assets/fonts/instrument-sans.woff2')
    font = instantiateVariableFont(font, {'wght': 500})
    upm = font['head'].unitsPerEm
    cap = font['OS/2'].sCapHeight or 700
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font['hmtx']

    size = MARK_SIZE * CAP_RATIO / (cap / upm)
    s = size / upm
    names = [cmap[ord(c)] for c in TEXT]
    baseline = MARK_SIZE / 2 + (cap * s) / 2

    first = BoundsPen(glyphs)
    glyphs[names[0]].draw(first)
    x0 = MARK_SIZE * (1 + GAP_RATIO) - first.bounds[0] * s

    pen = SVGPathPen(glyphs, ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
    bounds = BoundsPen(glyphs)
    x = 0.0
    for i, name in enumerate(names):
        ox = x0 + x * s
        glyphs[name].draw(TransformPen(pen, (s, 0, 0, -s, ox, baseline)))
        glyphs[name].draw(TransformPen(bounds, (s, 0, 0, -s, ox, baseline)))
        x += hmtx[name][0] + TRACKING * upm
        if i + 1 < len(names):
            x += kern(font, name, names[i + 1])
    word = pen.getCommands()
    right = bounds.bounds[2]
    width = round(right + 2, 2)
    height = MARK_SIZE
    k = MARK_SIZE / 100

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'pioneer-logo.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height:g}" viewBox="0 0 {width} {height:g}" role="img" aria-label="Pioneer">\n'
        f'  <title>Pioneer</title>\n'
        f'  <path fill="currentColor" fill-rule="evenodd" transform="scale({k:g})" d="{MARK}"/>\n'
        f'  <path fill="currentColor" d="{word}"/>\n'
        f'</svg>\n',
        encoding='utf-8',
    )
    (OUT / 'pioneer-mark.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" role="img" aria-label="Pioneer">\n'
        f'  <title>Pioneer</title>\n'
        f'  <path fill="currentColor" fill-rule="evenodd" d="{MARK}"/>\n'
        f'</svg>\n',
        encoding='utf-8',
    )
    print(f'pioneer-logo.svg {width} x {height:g} (wordmark {size:.1f}px, cap {cap * s:.1f}px, kerning applied)')


if __name__ == '__main__':
    main()
