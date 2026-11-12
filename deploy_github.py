# -*- coding: utf-8 -*-
"""德语词卡 · 一键发布到 GitHub + 开启 GitHub Pages

用法（PowerShell）：
    $env:GITHUB_TOKEN="YOUR_PAT"; python deploy_github.py german-word-cards
用法（Git Bash）：
    GITHUB_TOKEN=YOUR_PAT python deploy_github.py german-word-cards

令牌需要 classic PAT 的 repo 权限（含 pages）。脚本只使用 Python 标准库。
"""
import os, sys, json, base64, urllib.request, urllib.error, io

ROOT = os.path.dirname(os.path.abspath(__file__))
FILES = ['index.html', 'app.js', 'app.css', 'data/words.js', 'README.md', '.nojekyll', 'deploy_github.py']
TOKEN = (os.environ.get('GITHUB_TOKEN') or '').strip()
REPO = sys.argv[1] if len(sys.argv) > 1 else 'german-word-cards'
API = 'https://api.github.com'


def api(method, path, data=None):
    body = json.dumps(data, ensure_ascii=False).encode('utf-8') if data is not None else None
    req = urllib.request.Request(API + path, data=body, method=method, headers={
        'Authorization': 'Bearer ' + TOKEN,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'wortschatz-deploy',
    })
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        msg = e.read().decode('utf-8', 'ignore')[:300]
        raise RuntimeError('%s %s -> HTTP %s: %s' % (method, path, e.code, msg))


def main():
    if not TOKEN:
        raise SystemExit('缺少 GITHUB_TOKEN 环境变量')
    for f in FILES:
        if not os.path.isfile(os.path.join(ROOT, f)):
            raise SystemExit('缺少文件：' + f)

    me = api('GET', '/user')['login']
    print('账号：', me)

    # 1. 创建公开仓库（已存在则复用）
    try:
        api('POST', '/user/repos', {
            'name': REPO, 'description': '德语 A1–B2 词卡学习 Web App · 6,519 词 · 三人称变位 / 查阅统计',
            'private': False, 'auto_init': False, 'homepage': '',
            'has_issues': False, 'has_projects': False, 'has_wiki': False,
        })
        print('仓库已创建：', REPO)
    except RuntimeError as e:
        if 'HTTP 422' not in str(e):
            raise
        print('仓库已存在，复用：', REPO)

    base = '/repos/%s/%s' % (me, REPO)

    # 空仓库没有 git 数据库，先用 Contents API 建立一个初始提交
    head = None
    try:
        head = api('GET', base + '/git/refs/heads/main')['object']['sha']
    except RuntimeError as e:
        if 'HTTP 404' not in str(e) and 'HTTP 409' not in str(e):
            raise
    if not head:
        api('PUT', base + '/contents/.init', {
            'message': 'init', 'content': base64.b64encode(b'init\n').decode('ascii'),
            'branch': 'main'})
        head = api('GET', base + '/git/refs/heads/main')['object']['sha']
        print('已初始化空仓库')

    # 2. Git Data API：blob -> tree -> commit -> ref（支持 3.7MB 数据文件）
    tree = []
    for f in FILES:
        raw = open(os.path.join(ROOT, f), 'rb').read()
        if not raw:
            raw = b'\n'  # 空文件（.nojekyll）用换行占位
        blob = api('POST', base + '/git/blobs', {
            'content': base64.b64encode(raw).decode('ascii'), 'encoding': 'base64'})
        tree.append({'path': f, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
        print('  上传 %-18s %8d B' % (f, len(raw)))

    # 基于当前 HEAD 的 tree 增量更新，避免整树替换删掉仓库里已有的其它文件
    base_tree = api('GET', base + '/git/commits/' + head)['tree']['sha']
    tree_sha = api('POST', base + '/git/trees', {'base_tree': base_tree, 'tree': tree})['sha']
    commit_sha = api('POST', base + '/git/commits', {
        'message': '同步牌库：6,519 词 / 三人称变位 / 第二分词 / 换一组修复 / 查阅次数',
        'tree': tree_sha, 'parents': [head]})['sha']
    api('PATCH', base + '/git/refs/heads/main', {'sha': commit_sha, 'force': False})
    try:
        api('PATCH', base, {'default_branch': 'main'})
    except RuntimeError:
        pass
    print('代码已推送到 main')

    # 3. 开启 GitHub Pages
    pages_url = None
    try:
        pages_url = api('POST', base + '/pages', {
            'build_type': 'legacy', 'source': {'branch': 'main', 'path': '/'}})['html_url']
        print('Pages 已开启')
    except RuntimeError as e:
        if 'HTTP 409' in str(e):
            pages_url = api('GET', base + '/pages')['html_url']
            print('Pages 已存在，复用')
        else:
            raise

    print('\n完成：')
    print('  仓库  https://github.com/%s/%s' % (me, REPO))
    print('  网站  %s' % (pages_url or ('https://%s.github.io/%s/' % (me, REPO))))
    print('  首次构建约需 1–2 分钟，稍后刷新即可。')


if __name__ == '__main__':
    main()
