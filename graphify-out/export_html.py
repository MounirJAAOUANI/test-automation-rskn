import json
from pathlib import Path
from graphify.build import build_from_json
from graphify.export import to_html

root = Path('.')
extraction = json.loads((root / 'graphify-out' / '.graphify_extract.json').read_text(encoding='utf-8'))
analysis = json.loads((root / 'graphify-out' / '.graphify_analysis.json').read_text(encoding='utf-8'))
labels = json.loads((root / 'graphify-out' / '.graphify_labels.json').read_text(encoding='utf-8'))

G = build_from_json(extraction)
communities = {int(k): v for k, v in analysis['communities'].items()}
labels = {int(k): v for k, v in labels.items()}

output = root / 'graphify-out' / 'graph.html'
to_html(G, communities, str(output), community_labels=labels)
print(f'HTML exported to {output}')
