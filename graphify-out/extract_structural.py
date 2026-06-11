import json
from pathlib import Path
from graphify.extract import collect_files, extract, extract_markdown

root = Path('.')
detect = json.loads((root / 'graphify-out' / '.graphify_detect.json').read_text(encoding='utf-8'))

code_files = []
for f in detect.get('files', {}).get('code', []):
    p = Path(f)
    if p.is_dir():
        code_files.extend(collect_files(p))
    else:
        code_files.append(p)

doc_markdown = [Path(f) for f in detect.get('files', {}).get('document', []) if Path(f).suffix.lower() == '.md']

if code_files:
    ast_result = extract(code_files, cache_root=Path('.'), parallel=False)
else:
    ast_result = {'nodes': [], 'edges': [], 'input_tokens': 0, 'output_tokens': 0}

(root / 'graphify-out' / '.graphify_ast.json').write_text(json.dumps(ast_result, indent=2, ensure_ascii=False), encoding='utf-8')

md_nodes = []
md_edges = []
for p in doc_markdown:
    d = extract_markdown(p)
    md_nodes.extend(d.get('nodes', []))
    md_edges.extend(d.get('edges', []))

semantic_result = {'nodes': md_nodes, 'edges': md_edges, 'hyperedges': [], 'input_tokens': 0, 'output_tokens': 0}
(root / 'graphify-out' / '.graphify_semantic.json').write_text(json.dumps(semantic_result, indent=2, ensure_ascii=False), encoding='utf-8')

seen = {n['id'] for n in ast_result.get('nodes', [])}
merged_nodes = list(ast_result.get('nodes', []))
for n in md_nodes:
    if n['id'] not in seen:
        merged_nodes.append(n)
        seen.add(n['id'])
merged_edges = ast_result.get('edges', []) + md_edges
merged = {
    'nodes': merged_nodes,
    'edges': merged_edges,
    'hyperedges': [],
    'input_tokens': 0,
    'output_tokens': 0,
}
(root / 'graphify-out' / '.graphify_extract.json').write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding='utf-8')

print(f'Code files: {len(code_files)}, markdown docs: {len(doc_markdown)}')
print(f'AST nodes: {len(ast_result.get("nodes", []))}, AST edges: {len(ast_result.get("edges", []))}')
print(f'MD nodes: {len(md_nodes)}, MD edges: {len(md_edges)}')
print(f'Merged nodes: {len(merged_nodes)}, merged edges: {len(merged_edges)}')
