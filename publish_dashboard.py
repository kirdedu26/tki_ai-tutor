# -*- coding: utf-8 -*-
"""
교수자 대시보드 저장소(tki_ai-tutor_dashboard)를 이 폴더에서 생성한다.

대시보드는 튜터와 scenarios.js · profiles.js · ui-copy.js · styles.css · 폰트를 공유한다.
두 저장소를 따로 손대면 공유 파일이 어긋나 교수자 화면에만 옛 문구가 남는다.
그래서 대시보드 저장소는 손으로 고치지 않고 이 스크립트로만 갱신한다.
이 폴더가 언제나 단일 원본이다.

사용법
  python publish_dashboard.py           내용을 맞추고 무엇이 바뀌는지 보여준다(커밋 안 함)
  python publish_dashboard.py --commit  위 작업 + 커밋
  python publish_dashboard.py --push    위 작업 + 커밋 + 업로드
"""
import filecmp, os, re, shutil, subprocess, sys

SRC = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(SRC, 'publish', 'dashboard')
REMOTE = 'https://github.com/kirdedu26/tki_ai-tutor_dashboard.git'

# 대시보드가 실제로 불러오는 것만 옮긴다(dashboard.html의 script/link 태그 기준)
FILES = [
    'dashboard.html',
    'src/scenarios.js',
    'src/profiles.js',
    'src/ui-copy.js',
    'src/dashboard.js',
    'src/styles.css',
    '.gitattributes',
]
FONT_DIR = 'fonts'

DASH_GITIGNORE = """# 이 저장소는 publish_dashboard.py가 생성한다. 직접 고치지 말 것.
.vercel
.env*
"""

DASH_README = """# TKI 갈등 대응 AI 튜터 — 교수자 대시보드

학습자 튜터가 보낸 익명 결과를 코호트 단위로 집계해 보여줍니다.

> **이 저장소는 직접 고치지 마세요.**
> 튜터 저장소 [`tki_ai-tutor`](https://github.com/kirdedu26/tki_ai-tutor)가 단일 원본이고,
> 이곳은 그쪽 작업 폴더의 `publish_dashboard.py`가 생성합니다. 여기서 고치면 다음 배포 때
> 덮어써집니다.

## 여는 법

```
https://kirdedu26.github.io/tki_ai-tutor_dashboard/dashboard.html#token=<READ_TOKEN>
```

주소 끝의 `#token=` 이 없으면 "열람 권한이 없습니다"만 표시됩니다. 토큰은 Apps Script의
스크립트 속성 `READ_TOKEN` 값이며 코드에는 들어 있지 않습니다.

**이 주소를 공유하면 열람 권한을 준 것과 같습니다.** 전달하실 때 유의해 주세요.

## 튜터와 공유하는 파일

`src/scenarios.js` `src/profiles.js` `src/ui-copy.js` `src/styles.css`와 `fonts/`는 튜터
저장소와 같은 내용이어야 합니다. 유형 라벨이나 문구를 고쳤는데 이곳에 반영되지 않으면
교수자 화면에만 옛 라벨이 남습니다. 실제로 겪었던 문제라 생성 방식으로 바꿨습니다.

## 수집 항목

이름·학번은 수집하지 않습니다. 진단 백분위 5개, 프로파일(직군·역할·상대 유형), 실습별
타깃·상대·결말, 결정별 (단계·대응유형·상황 적합 경향)입니다.
"""


def run(args, cwd=OUT, check=True):
    p = subprocess.run(args, cwd=cwd, capture_output=True)
    out = (p.stdout + p.stderr).decode('utf-8', 'replace').strip()
    if check and p.returncode != 0:
        sys.stderr.write(out + '\n')
        sys.exit(p.returncode)
    return out


def copy_if_changed(rel, changed):
    src, dst = os.path.join(SRC, rel), os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst) and filecmp.cmp(src, dst, shallow=False):
        return
    shutil.copy2(src, dst)
    changed.append(rel)


def main():
    if not os.path.exists(os.path.join(SRC, 'dashboard.html')):
        sys.stderr.write('원본 폴더에서 실행하세요.\n'); sys.exit(1)
    os.makedirs(OUT, exist_ok=True)

    changed = []
    for rel in FILES:
        copy_if_changed(rel, changed)
    for name in sorted(os.listdir(os.path.join(SRC, FONT_DIR))):
        copy_if_changed(FONT_DIR + '/' + name, changed)

    for name, body in (('.gitignore', DASH_GITIGNORE), ('README.md', DASH_README)):
        path = os.path.join(OUT, name)
        old = open(path, encoding='utf-8').read() if os.path.exists(path) else None
        if old != body:
            open(path, 'w', encoding='utf-8', newline='').write(body)
            changed.append(name)

    # 캐시 버전이 튜터와 같은지 확인한다. 어긋나면 교수자 화면에 옛 문구가 남는다.
    tv = re.search(r'v=([0-9.]+)', open(os.path.join(SRC, 'index.html'), encoding='utf-8').read())
    dv = re.search(r'v=([0-9.]+)', open(os.path.join(OUT, 'dashboard.html'), encoding='utf-8').read())
    if tv and dv and tv.group(1) != dv.group(1):
        sys.stderr.write('★ 캐시 버전 불일치 — index.html v=%s / dashboard.html v=%s\n'
                         '  두 파일의 ?v= 값을 같게 맞춘 뒤 다시 실행하세요.\n'
                         % (tv.group(1), dv.group(1)))
        sys.exit(1)

    if not os.path.isdir(os.path.join(OUT, '.git')):
        run(['git', 'init', '-q', '-b', 'main'])
        run(['git', 'config', 'user.name', 'kirdedu26'])
        run(['git', 'config', 'user.email', 'kirdedu26@naver.com'])
        run(['git', 'remote', 'add', 'origin', REMOTE])
        print('저장소 새로 만듦:', OUT)

    print('바뀐 파일 %d개%s' % (len(changed), (': ' + ', '.join(changed[:8])) if changed else ' (이미 최신)'))
    print('캐시 버전 %s — 튜터와 일치' % (tv.group(1) if tv else '?'))

    status = run(['git', 'status', '--porcelain'])
    if not status:
        print('커밋할 변경 없음'); return
    if '--commit' not in sys.argv and '--push' not in sys.argv:
        print('\n[미리보기] 아래가 커밋 대상입니다. 반영하려면 --commit 또는 --push 를 붙이세요.')
        print(status); return

    run(['git', 'add', '-A'])
    run(['git', 'commit', '-q', '-m', '튜터 저장소에서 동기화 (v%s)' % (tv.group(1) if tv else '')])
    print('커밋 완료')
    if '--push' in sys.argv:
        print(run(['git', 'push', '-u', 'origin', 'main']))


main()
