from flask import Flask, jsonify, render_template, send_from_directory
from database import SermonLog
import os
app = Flask(__name__, static_folder='.', static_url_path='')

@app.route('/manifest.json')
def manifest(): return send_from_directory('.', 'manifest.json')

@app.route('/sw.js')
def sw(): return send_from_directory('.', 'sw.js')

@app.route('/logo.png')
def logo(): return send_from_directory('.', 'logo.png')

@app.route('/api/sermons')
def sermons():
    db = SermonLog()
    rows = db.get_all_sermons()
    out = []
    for r in rows:
        text = r['sermon_text'] or ''
        out.append({
            'id': r['id'], 'title': r['title'], 'book': r['book'],
            'chapter': r['chapter'], 'start': r['start_verse'], 'end': r['end_verse'],
            'status': r['status'], 'tags': __import__('json').loads(r['tags'] or '[]'),
            'preview': text[:300] + ('...' if len(text) > 300 else ''),
            'audio': r['audio_file_path'], 'word_count': len(text.split()),
            'passage': f"{r['book']} {r['chapter']}:{r['start_verse']}-{r['end_verse']}"
        })
    return jsonify(out)

@app.route('/api/sermon/<int:id>')
def sermon(id):
    db = SermonLog()
    r = db.get_sermon_by_id(id)
    if not r: return jsonify({'error':'not found'}), 404
    return jsonify({
        'id': r['id'], 'title': r['title'], 'book': r['book'],
        'chapter': r['chapter'], 'start': r['start_verse'], 'end': r['end_verse'],
        'status': r['status'], 'tags': __import__('json').loads(r['tags'] or '[]'),
        'preview': r['sermon_text'] or '',  # FULL text for detail
        'audio': r['audio_file_path'],
        'passage': f"{r['book']} {r['chapter']}:{r['start_verse']}-{r['end_verse']}"
    })

@app.route('/sermon/<int:id>')
def detail(id):
    return render_template('detail.html', sermon_id=id)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
