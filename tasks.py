from invocate import task


@task(name='bundle')
def bundle(c):
    """Bundle the modular JS files into main.js"""
    files = [
        'contents/code/init.js',
        'contents/code/logging.js',
        'contents/code/config.js',
        'contents/code/windowing.js',
        'contents/code/gaps.js',
        'contents/code/cascade.js',
        'contents/code/reaction.js',
        'contents/code/main_loop.js'
    ]
    c.run(f'cat {" ".join(files)} > contents/code/main.js')


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
