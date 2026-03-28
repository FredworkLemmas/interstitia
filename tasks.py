from invocate import task


@task(namespace='dev', name='bundle')
def bundle(c):
    """Bundle the modular JS files into main.js"""
    import glob
    import os
    files = sorted([f for f in glob.glob('contents/code/*.js') if os.path.basename(f) != 'main.js'])
    c.run(f'cat {" ".join(files)} > contents/code/main.js')


@task(namespace='dev', name='clean-repo')
def clean_repo(c):
    c.run('rm -f contents/code/main.js')

@task(namespace='dev', name='show-logs')
def show_logs(c, pty=True):
    #c.run('journalctl -f | grep kwin')
    c.run('journalctl -f | grep interstitia')


@task(namespace='dev', name='install', pre=[bundle])
def install(c):
    c.run('sh ./install.sh')


@task(namespace='dev', name='release', pre=[bundle])
def release(c):
    c.run('sh ./package.sh')


@task(namespace='dev', name='install-tools')
def install_tools(c):
    """Install dev tools (Prettier, ESLint, Jest)"""
    c.run('npm install')


@task(namespace='dev', name='lint', pre=[clean_repo])
def lint(c):
    """Run ESLint on source files (excluding main.js)"""
    c.run('npx eslint contents/code/*.js')


@task(namespace='dev', name='format')
def format_code(c):
    """Run Prettier on source files (excluding main.js)"""
    c.run('npx prettier --write contents/code/*.js')


@task(namespace='dev', name='test')
def test(c):
    """Run Jest tests"""
    c.run('npx jest')
