# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=[('C:/Users/fan20/miniconda3/envs/ml_hw/Library/bin/ffi.dll', '.'), ('C:/Users/fan20/miniconda3/envs/ml_hw/Library/bin/liblzma.dll', '.'), ('C:/Users/fan20/miniconda3/envs/ml_hw/Library/bin/libbz2.dll', '.'), ('C:/Users/fan20/miniconda3/envs/ml_hw/Library/bin/libexpat.dll', '.')],
    datas=[('static', 'static')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='EnglishReader',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='EnglishReader',
)
