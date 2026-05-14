; build/installer.nsh
; MetaCode 自定义 NSIS 安装界面补充配置
; 注意: MUI_HEADERIMAGE / MUI_HEADERIMAGE_BITMAP / MUI_WELCOMEFINISHPAGE_BITMAP
; 等由 electron-builder 自动通过命令行传入，这里不用重复定义

; ========== 现代配色 ==========
!define MUI_BGCOLOR FFFFFF

; ========== 页面配置 ==========
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_FINISHPAGE_NOAUTOCLOSE
!define MUI_ABORTWARNING

; ========== 可选: 集成 NsisModernUI ==========
; 如需更现代的扁平化 UI，下载 https://github.com/Southclaws/nsis-modern-ui
; 将文件放到 build/nsis-modern-ui/ 目录下，取消注释下面两行:
; !define NSISMODERNUi_CONFIRMPAGE
; !include "${BUILD_RESOURCES_DIR}\nsis-modern-ui\NsisModernUI.nsh"
