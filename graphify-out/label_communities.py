import json
from pathlib import Path
from graphify.build import build_from_json
from graphify.cluster import score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate

root = Path('.')
extraction = json.loads((root / 'graphify-out' / '.graphify_extract.json').read_text(encoding='utf-8'))
detection = json.loads((root / 'graphify-out' / '.graphify_detect.json').read_text(encoding='utf-8'))
analysis = json.loads((root / 'graphify-out' / '.graphify_analysis.json').read_text(encoding='utf-8'))

G = build_from_json(extraction)
communities = {int(k): v for k, v in analysis['communities'].items()}
cohesion = {int(k): v for k, v in analysis['cohesion'].items()}
tokens = {'input': extraction.get('input_tokens', 0), 'output': extraction.get('output_tokens', 0)}

labels = {
    0: 'README deployment troubleshooting',
    1: 'Root package metadata',
    2: 'GitHub poller and job queue',
    3: 'Server package dependencies',
    4: 'Client package dependencies',
    5: 'App tsconfig compiler options',
    6: 'AI prompt generation routines',
    7: 'Node tsconfig compiler options',
    8: 'Dev build tooling',
    9: 'GitHub/OpenAI integration',
    10: 'Client UI config components',
    11: 'Env vars and secrets',
    12: 'App workflow steps',
    13: 'Base tsconfig strict settings',
    14: 'Play Store upload',
    15: 'Flutter app UI',
    16: 'Privacy policy generation',
    17: 'Prerequisite panel',
    18: 'Firebase admin setup',
    19: 'Agent runner API',
    20: 'Build script',
    21: 'Client Vite config',
    22: 'ESLint config',
    23: 'Vite config',
}

questions = suggest_questions(G, communities, labels)
report = generate(G, communities, cohesion, labels, analysis['gods'], analysis['surprises'], detection, tokens, '.', suggested_questions=questions)
(root / 'graphify-out' / 'GRAPH_REPORT.md').write_text(report, encoding='utf-8')
(root / 'graphify-out' / '.graphify_labels.json').write_text(json.dumps({str(k): v for k, v in labels.items()}, ensure_ascii=False), encoding='utf-8')
print('Report updated with community labels')
