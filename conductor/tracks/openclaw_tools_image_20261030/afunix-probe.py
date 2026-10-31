import os, socket, tempfile, subprocess
print("uid", os.getuid(), "tmpdir", tempfile.gettempdir())
for name, fam, typ in [("AF_UNIX/STREAM", socket.AF_UNIX, socket.SOCK_STREAM), ("AF_UNIX/DGRAM", socket.AF_UNIX, socket.SOCK_DGRAM)]:
    try:
        s = socket.socket(fam, typ); s.close(); print(name, "ok")
    except OSError as e:
        print(name, "BLOCKED", e)
try:
    a, b = socket.socketpair(); a.close(); b.close(); print("socketpair ok")
except OSError as e:
    print("socketpair BLOCKED", e)
p = os.path.join(tempfile.gettempdir(), "af-test.sock")
try:
    s = socket.socket(socket.AF_UNIX); s.bind(p); s.listen(1); s.close(); os.unlink(p); print("bind+listen ok", p)
except OSError as e:
    print("bind+listen BLOCKED", e)
