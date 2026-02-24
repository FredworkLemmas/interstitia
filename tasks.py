from invocate import task


@task(namespace='dev', name='show-logs')
def show_logs(c, pty=True):
    #c.run('journalctl -f | grep kwin')
    c.run('journalctl -f | grep interstitia')


@task(namespace='dev', name='install')
def install(c):
    c.run('sh ./install.sh')
