#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Audio Visualizer i18n migration helper.

What this script does:
- Upgrades `t(key)` to `t(key, vars = {})`
- Replaces hardcoded user-facing strings in script.js with i18n calls
- Rewrites repeat labels to a language-aware helper
- Keeps the source in plain JavaScript output

Usage:
    python i18n_migrate_audio_visualizer.py --input script.js --output script.i18n.js
    python i18n_migrate_audio_visualizer.py --input script.js --inplace
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Callable, Dict, List, Tuple, Union


# ---------------------------------------------------------------------------
# Dictionaries
# ---------------------------------------------------------------------------

TRANSLATIONS: Dict[str, Dict[str, str]] = {
    "ja": {
        # General/status
        "status.idle": "待機中...",
        "status.loading": "⏳ 読み込み中...",
        "status.playError": "再生エラー",
        "status.mic": "🎤 マイク入力中",

        # Next up / playlist
        "next.none": "次: --",
        "next.track": "次: {name}",
        "playlist.empty": "曲を追加してください",
        "playlist.notFound": "見つかりませんでした",
        "playlist.restored": "📂 プレイリストを復元しました",

        # Storage
        "storage.empty": "保存済みのファイルはありません",

        # Repeat
        "repeat.none": "🔁 リピートOFF",
        "repeat.one": "🔂 1曲リピート",
        "repeat.all": "🔁 全曲リピート",

        # Common values
        "common.high": "強",
        "common.medium": "中",
        "common.low": "弱",
        "common.unsupported": "未対応",
        "common.unknown": "Unknown",

        # Overlays
        "overlay.seekBack": "⏪ -10秒",
        "overlay.seekForward": "⏩ +10秒",
        "overlay.videoLoadFailed": "⚠️ 動画の読み込みに失敗しました",
        "overlay.videoEnded": "⏹ 動画終了により停止しました",
        "overlay.mode": "📊 モード: {mode}",
        "overlay.languageChangedJa": "🇯🇵 日本語に変更しました",
        "overlay.languageChangedEn": "🇬🇧 English",
        "overlay.languageChangedZh": "🇨🇳 中文",
        "overlay.playlistCleared": "✅ プレイリストをクリアしました",
        "overlay.volumeUp": "🔊 音量: {value}%",
        "overlay.volumeDown": "🔉 音量: {value}%",
        "overlay.videoOn": "📺 動画表示: ON",
        "overlay.videoOff": "📺 動画表示: OFF",
        "overlay.fps": "🎬 FPS: {fps}",
        "overlay.rainbowOn": "🌈 虹色モード: ON",
        "overlay.rainbowOff": "🎨 虹色モード: OFF",
        "overlay.mirrorOn": "🪞 左右反転: ON",
        "overlay.mirrorOff": "🪞 左右反転: OFF",
        "overlay.playbackSpeed": "⏩ 再生速度: {rate}x",
        "overlay.noFileSelected": "対応するファイルを選択してください",
        "overlay.importingFiles": "📥 {count}個のファイルを取り込み中...",
        "overlay.filesAdded": "✅ {count}個のファイルを追加しました",
        "overlay.fileSelectFailed": "❌ ファイル選択に失敗しました",
        "overlay.androidOnly": "この機能はAndroidアプリ版で利用できます",
        "overlay.selectFolder": "📂 フォルダを選択してください",
        "overlay.folderNoFiles": "フォルダ内に対応ファイルが見つかりませんでした",
        "overlay.eq": "🎵 EQ: {name}",
        "overlay.centerReset": "音楽の重心を中央にリセット",
        "overlay.localSaveOn": "💾 ローカル保存: ON",
        "overlay.localSaveOff": "🔗 ローカル保存: OFF (URIのみ)",
        "overlay.sleepOff": "⏰ スリープタイマーOFF",
        "overlay.sleepStart": "⏰ {minutes}分後に停止します",
        "overlay.colorApplied": "🎨 {name} カラー適用",
        "overlay.presetSaved": "💾 プリセット {slot} を保存しました",
        "overlay.presetLoaded": "📂 プリセット {slot} を読み込みました",
        "overlay.loadFailed": "❌ 読み込みに失敗しました",
        "overlay.presetEmpty": "❌ プリセット {slot} は空です",
        "overlay.settingsSaved": "✅ 設定を保存しました",
        "overlay.micStarted": "🎤 マイク入力開始",
        "overlay.warn": "⚠️ {msg}",
        "overlay.shuffleOn": "🔀 シャッフルON",
        "overlay.shuffleOff": "🔀 シャッフルOFF",
        "overlay.nowPlaying": "Now Playing: {title}",
        "overlay.playFailed": "⚠️ 再生に失敗しました",
        "overlay.urlPrepareFailed": "⚠️ URL準備に失敗しました",
        "overlay.audioError": "⚠️ オーディオエラーが発生しました",
        "overlay.deleteNone": "削除対象がありません",
        "overlay.allDeleted": "🗑️ すべて削除しました",
        "overlay.playlistReordered": "プレイリストの順序を変更しました",
        "overlay.sleepStopped": "💤 スリープタイマーで停止しました",
        "overlay.exporting": "🎬 動画書き出し中...",
        "overlay.exportComplete": "書き出し完了",
        "overlay.exportBlockedMic": "マイク入力モードでは書き出しできません",
        "overlay.resetting": "初期化中...",
        "overlay.initFailed": "初期化に失敗しました: {message}",
        "overlay.filePickerMissing": "FilePickerプラグインが見つかりません。android-appで依存追加後に `npx cap sync` してください。",
        "overlay.uriModeSwitchConfirm": "「URIのみ」に切り替えるため、アプリ内に保存済みのローカルファイルをプレイリストから削除しますか？\n\n削除すると、再起動後にそれらの曲は復元できなくなります。",
        "overlay.deleteStoredFilesConfirm": "アプリ内に保持しているファイルをすべて削除しますか？\nプレイリストからも削除されます。",
        "overlay.resetAllConfirm": "すべての設定、プレイリスト、保存ファイルを削除して初期状態に戻しますか？",
        "overlay.clearPlaylistConfirm": "プレイリストをすべてクリアしますか？",
        "overlay.exportConfirm": "現在の曲を動画として書き出しますか？",

        # Alerts / confirms
        "alert.initFailed": "初期化に失敗しました: {message}",
        "alert.exportComplete": "書き出し完了",
        "alert.exportBlockedMic": "マイク入力モードでは書き出しできません",
        "alert.filePickerMissing": "FilePickerプラグインが見つかりません。android-appで依存追加後に `npx cap sync` してください。",
        "confirm.resetAll": "すべての設定、プレイリスト、保存ファイルを削除して初期状態に戻しますか？",
        "confirm.clearPlaylist": "プレイリストをすべてクリアしますか？",
        "confirm.switchUriMode": "「URIのみ」に切り替えるため、アプリ内に保存済みのローカルファイルをプレイリストから削除しますか？\n\n削除すると、再起動後にそれらの曲は復元できなくなります。",
        "confirm.deleteStoredFiles": "アプリ内に保持しているファイルをすべて削除しますか？\nプレイリストからも削除されます。",
        "confirm.exportVideo": "現在の曲を動画として書き出しますか？",

        # Developer message
        "devMessage.loadFailed": "開発者メッセージを読み込めませんでした。",

        # Mic / labels
        "mic.device": "マイク {id}",
        "mic.default": "デフォルト",
    },
    "en": {
        "status.idle": "Idle...",
        "status.loading": "⏳ Loading...",
        "status.playError": "Playback Error",
        "status.mic": "🎤 Microphone Input",

        "next.none": "Next: --",
        "next.track": "Next: {name}",
        "playlist.empty": "Please add tracks",
        "playlist.notFound": "No results found",
        "playlist.restored": "📂 Playlist restored",

        "storage.empty": "No saved files found",

        "repeat.none": "🔁 Repeat Off",
        "repeat.one": "🔂 Repeat One",
        "repeat.all": "🔁 Repeat All",

        "common.high": "High",
        "common.medium": "Medium",
        "common.low": "Low",
        "common.unsupported": "Unsupported",
        "common.unknown": "Unknown",

        "overlay.seekBack": "⏪ -10 sec",
        "overlay.seekForward": "⏩ +10 sec",
        "overlay.videoLoadFailed": "⚠️ Failed to load video",
        "overlay.videoEnded": "⏹ Stopped because the video ended",
        "overlay.mode": "📊 Mode: {mode}",
        "overlay.languageChangedJa": "🇯🇵 Japanese",
        "overlay.languageChangedEn": "🇬🇧 English",
        "overlay.languageChangedZh": "🇨🇳 Chinese",
        "overlay.playlistCleared": "✅ Playlist cleared",
        "overlay.volumeUp": "🔊 Volume: {value}%",
        "overlay.volumeDown": "🔉 Volume: {value}%",
        "overlay.videoOn": "📺 Video: ON",
        "overlay.videoOff": "📺 Video: OFF",
        "overlay.fps": "🎬 FPS: {fps}",
        "overlay.rainbowOn": "🌈 Rainbow Mode: ON",
        "overlay.rainbowOff": "🎨 Rainbow Mode: OFF",
        "overlay.mirrorOn": "🪞 Mirror Mode: ON",
        "overlay.mirrorOff": "🪞 Mirror Mode: OFF",
        "overlay.playbackSpeed": "⏩ Playback speed: {rate}x",
        "overlay.noFileSelected": "Please select a supported file",
        "overlay.importingFiles": "📥 Importing {count} files...",
        "overlay.filesAdded": "✅ Added {count} files",
        "overlay.fileSelectFailed": "❌ Failed to select files",
        "overlay.androidOnly": "This feature is available in the Android app version",
        "overlay.selectFolder": "📂 Select a folder",
        "overlay.folderNoFiles": "No supported files were found in the folder",
        "overlay.eq": "🎵 EQ: {name}",
        "overlay.centerReset": "Audio balance reset to center",
        "overlay.localSaveOn": "💾 Local storage: ON",
        "overlay.localSaveOff": "🔗 Local storage: OFF (URI only)",
        "overlay.sleepOff": "⏰ Sleep timer OFF",
        "overlay.sleepStart": "⏰ Stopping in {minutes} minutes",
        "overlay.colorApplied": "🎨 Applied {name} color",
        "overlay.presetSaved": "💾 Preset {slot} saved",
        "overlay.presetLoaded": "📂 Preset {slot} loaded",
        "overlay.loadFailed": "❌ Failed to load",
        "overlay.presetEmpty": "❌ Preset {slot} is empty",
        "overlay.settingsSaved": "✅ Settings saved",
        "overlay.micStarted": "🎤 Microphone input started",
        "overlay.warn": "⚠️ {msg}",
        "overlay.shuffleOn": "🔀 Shuffle ON",
        "overlay.shuffleOff": "🔀 Shuffle OFF",
        "overlay.nowPlaying": "Now Playing: {title}",
        "overlay.playFailed": "⚠️ Playback failed",
        "overlay.urlPrepareFailed": "⚠️ Failed to prepare URL",
        "overlay.audioError": "⚠️ An audio error occurred",
        "overlay.deleteNone": "No target to delete",
        "overlay.allDeleted": "🗑️ Deleted all",
        "overlay.playlistReordered": "Playlist order changed",
        "overlay.sleepStopped": "💤 Stopped by sleep timer",
        "overlay.exporting": "🎬 Exporting video...",
        "overlay.exportComplete": "Export complete",
        "overlay.exportBlockedMic": "Cannot export while in microphone input mode",
        "overlay.resetting": "Resetting...",
        "overlay.initFailed": "Initialization failed: {message}",
        "overlay.filePickerMissing": "FilePicker plugin not found. After adding dependencies in android-app, run `npx cap sync`.",
        "overlay.uriModeSwitchConfirm": "To switch to \"URI only\", remove locally stored files from the playlist?\n\nIf you remove them, they will not be restored after restart.",
        "overlay.deleteStoredFilesConfirm": "Delete all files stored in the app?\nThey will also be removed from the playlist.",
        "overlay.resetAllConfirm": "Delete all settings, playlists, and saved files and return to the initial state?",
        "overlay.clearPlaylistConfirm": "Clear the entire playlist?",
        "overlay.exportConfirm": "Export the current track as a video?",

        "alert.initFailed": "Initialization failed: {message}",
        "alert.exportComplete": "Export complete",
        "alert.exportBlockedMic": "Cannot export while in microphone input mode",
        "alert.filePickerMissing": "FilePicker plugin not found. After adding dependencies in android-app, run `npx cap sync`.",

        "confirm.resetAll": "Delete all settings, playlists, and saved files and return to the initial state?",
        "confirm.clearPlaylist": "Clear the entire playlist?",
        "confirm.switchUriMode": "To switch to \"URI only\", remove locally stored files from the playlist?\n\nIf you remove them, they will not be restored after restart.",
        "confirm.deleteStoredFiles": "Delete all files stored in the app?\nThey will also be removed from the playlist.",
        "confirm.exportVideo": "Export the current track as a video?",

        "devMessage.loadFailed": "Failed to load developer message.",

        "mic.device": "Microphone {id}",
        "mic.default": "Default",
    },
    "zh": {
        "status.idle": "待机中...",
        "status.loading": "⏳ 加载中...",
        "status.playError": "播放错误",
        "status.mic": "🎤 麦克风输入中",

        "next.none": "下一首: --",
        "next.track": "下一首: {name}",
        "playlist.empty": "请添加曲目",
        "playlist.notFound": "未找到",
        "playlist.restored": "📂 已恢复播放列表",

        "storage.empty": "没有已保存的文件",

        "repeat.none": "🔁 关闭循环",
        "repeat.one": "🔂 单曲循环",
        "repeat.all": "🔁 全部循环",

        "common.high": "高",
        "common.medium": "中",
        "common.low": "低",
        "common.unsupported": "不支持",
        "common.unknown": "Unknown",

        "overlay.seekBack": "⏪ -10秒",
        "overlay.seekForward": "⏩ +10秒",
        "overlay.videoLoadFailed": "⚠️ 视频加载失败",
        "overlay.videoEnded": "⏹ 因视频结束而停止",
        "overlay.mode": "📊 模式: {mode}",
        "overlay.languageChangedJa": "🇯🇵 日语",
        "overlay.languageChangedEn": "🇬🇧 英语",
        "overlay.languageChangedZh": "🇨🇳 中文",
        "overlay.playlistCleared": "✅ 播放列表已清空",
        "overlay.volumeUp": "🔊 音量: {value}%",
        "overlay.volumeDown": "🔉 音量: {value}%",
        "overlay.videoOn": "📺 视频显示: 开",
        "overlay.videoOff": "📺 视频显示: 关",
        "overlay.fps": "🎬 FPS: {fps}",
        "overlay.rainbowOn": "🌈 彩虹模式: 开",
        "overlay.rainbowOff": "🎨 彩虹模式: 关",
        "overlay.mirrorOn": "🪞 左右翻转: 开",
        "overlay.mirrorOff": "🪞 左右翻转: 关",
        "overlay.playbackSpeed": "⏩ 播放速度: {rate}x",
        "overlay.noFileSelected": "请选择支持的文件",
        "overlay.importingFiles": "📥 正在导入 {count} 个文件...",
        "overlay.filesAdded": "✅ 已添加 {count} 个文件",
        "overlay.fileSelectFailed": "❌ 文件选择失败",
        "overlay.androidOnly": "此功能可在 Android 应用版中使用",
        "overlay.selectFolder": "📂 请选择文件夹",
        "overlay.folderNoFiles": "文件夹中未找到支持的文件",
        "overlay.eq": "🎵 EQ: {name}",
        "overlay.centerReset": "已将音乐重心重置到中央",
        "overlay.localSaveOn": "💾 本地保存：开",
        "overlay.localSaveOff": "🔗 本地保存：关（仅 URI）",
        "overlay.sleepOff": "⏰ 睡眠定时器关闭",
        "overlay.sleepStart": "⏰ 将在 {minutes} 分钟后停止",
        "overlay.colorApplied": "🎨 已应用 {name} 颜色",
        "overlay.presetSaved": "💾 预设 {slot} 已保存",
        "overlay.presetLoaded": "📂 预设 {slot} 已加载",
        "overlay.loadFailed": "❌ 加载失败",
        "overlay.presetEmpty": "❌ 预设 {slot} 为空",
        "overlay.settingsSaved": "✅ 设置已保存",
        "overlay.micStarted": "🎤 已开始麦克风输入",
        "overlay.warn": "⚠️ {msg}",
        "overlay.shuffleOn": "🔀 随机播放 开",
        "overlay.shuffleOff": "🔀 随机播放 关",
        "overlay.nowPlaying": "正在播放: {title}",
        "overlay.playFailed": "⚠️ 播放失败",
        "overlay.urlPrepareFailed": "⚠️ URL 准备失败",
        "overlay.audioError": "⚠️ 发生音频错误",
        "overlay.deleteNone": "没有可删除的目标",
        "overlay.allDeleted": "🗑️ 已全部删除",
        "overlay.playlistReordered": "播放列表顺序已更改",
        "overlay.sleepStopped": "💤 由睡眠定时器停止",
        "overlay.exporting": "🎬 正在导出视频...",
        "overlay.exportComplete": "导出完成",
        "overlay.exportBlockedMic": "麦克风输入模式下无法导出",
        "overlay.resetting": "正在重置...",
        "overlay.initFailed": "初始化失败: {message}",
        "overlay.filePickerMissing": "未找到 FilePicker 插件。请在 android-app 中添加依赖后运行 `npx cap sync`。",
        "overlay.uriModeSwitchConfirm": "为了切换到“仅 URI”，要从播放列表中删除已保存在应用内的本地文件吗？\n\n删除后，重启后将无法恢复这些曲目。",
        "overlay.deleteStoredFilesConfirm": "要删除应用中保存的所有文件吗？\n这些文件也会从播放列表中移除。",
        "overlay.resetAllConfirm": "要删除所有设置、播放列表和已保存文件，并恢复到初始状态吗？",
        "overlay.clearPlaylistConfirm": "要清空整个播放列表吗？",
        "overlay.exportConfirm": "要将当前曲目导出为视频吗？",

        "alert.initFailed": "初始化失败: {message}",
        "alert.exportComplete": "导出完成",
        "alert.exportBlockedMic": "麦克风输入模式下无法导出",
        "alert.filePickerMissing": "未找到 FilePicker 插件。请在 android-app 中添加依赖后运行 `npx cap sync`。",

        "confirm.resetAll": "要删除所有设置、播放列表和已保存文件，并恢复到初始状态吗？",
        "confirm.clearPlaylist": "要清空整个播放列表吗？",
        "confirm.switchUriMode": "为了切换到“仅 URI”，要从播放列表中删除已保存在应用内的本地文件吗？\n\n删除后，重启后将无法恢复这些曲目。",
        "confirm.deleteStoredFiles": "要删除应用中保存的所有文件吗？\n这些文件也会从播放列表中移除。",
        "confirm.exportVideo": "要将当前曲目导出为视频吗？",

        "devMessage.loadFailed": "无法加载开发者消息。",

        "mic.device": "麦克风 {id}",
        "mic.default": "默认",
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def js_string(s: str) -> str:
    """Return a single-quoted JS string literal."""
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n") + "'"


def js_template(s: str) -> str:
    """Return a JS template literal."""
    return "`" + s.replace("\\", "\\\\").replace("`", "\\`") + "`"


def replace_once(text: str, old: str, new: str) -> Tuple[str, bool]:
    if old in text:
        return text.replace(old, new, 1), True
    return text, False


def apply_regex_sub(text: str, pattern: str, repl: Union[str, Callable[[re.Match], str]], flags=0, count: int = 0) -> Tuple[str, int]:
    new_text, n = re.subn(pattern, repl, text, count=count, flags=flags)
    return new_text, n


# ---------------------------------------------------------------------------
# Source patching
# ---------------------------------------------------------------------------

def upgrade_t_function(text: str) -> Tuple[str, int]:
    pattern = r"""function\s+t\(key\)\s*\{\s*
    if\s*\(!window\.I18N\)\s*return\s+key;\s*
    if\s*\(I18N\[currentLang\]\s*&&\s*I18N\[currentLang\]\[key\]\s*!==\s*undefined\)\s*\{\s*
        return\s+I18N\[currentLang\]\[key\];\s*
    \}\s*
    if\s*\(I18N\['ja'\]\s*&&\s*I18N\['ja'\]\[key\]\s*!==\s*undefined\)\s*\{\s*
        return\s+I18N\['ja'\]\[key\];\s*
    \}\s*
    return\s+key;\s*
\}"""
    replacement = """function t(key, vars = {}) {
    if (!window.I18N) return key;
    let text;
    if (I18N[currentLang] && I18N[currentLang][key] !== undefined) {
        text = I18N[currentLang][key];
    } else if (I18N['ja'] && I18N['ja'][key] !== undefined) {
        text = I18N['ja'][key];
    } else {
        text = key;
    }
    for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
}"""
    return apply_regex_sub(text, pattern, replacement, flags=re.X | re.M)


def replace_labels(text: str) -> Tuple[str, int]:
    pattern = r"const\s+labels\s*=\s*\{\s*none:\s*'🔁\s*リピートOFF',\s*one:\s*'🔂\s*1曲リピート',\s*all:\s*'🔁\s*全曲リピート'\s*\};"
    replacement = """function getRepeatLabels() {
    return {
        none: t('repeat.none'),
        one: t('repeat.one'),
        all: t('repeat.all')
    };
}"""
    return apply_regex_sub(text, pattern, replacement, flags=re.M | re.S)


def replace_text_literals(text: str) -> Tuple[str, int]:
    total = 0

    # Strongly structured replacements
    structured = [
        # Seek overlay
        (
            r"showOverlay\(\s*deltaSeconds\s*<\s*0\s*\?\s*'⏪\s*-10秒'\s*:\s*'⏩\s*\+10秒'\s*\)",
            "showOverlay(deltaSeconds < 0 ? t('overlay.seekBack') : t('overlay.seekForward'))",
        ),
        (
            r"showOverlay\(`📊 モード: \$\{modeName\}`\)",
            "showOverlay(t('overlay.mode', { mode: modeName }))",
        ),
        (
            r"showOverlay\(\s*currentLang\s*===\s*'ja'\s*\?\s*'🇯🇵 日本語に変更しました'\s*:\s*currentLang\s*===\s*'en'\s*\?\s*'🇬🇧 English'\s*:\s*'🇨🇳 中文'\s*\)",
            "showOverlay(currentLang === 'ja' ? t('overlay.languageChangedJa') : currentLang === 'en' ? t('overlay.languageChangedEn') : t('overlay.languageChangedZh'))",
        ),
        (
            r"showOverlay\('✅ プレイリストをクリアしました'\)",
            "showOverlay(t('overlay.playlistCleared'))",
        ),
        (
            r"showOverlay\(`🔊 音量: \$\{Math\.round\(audio\.volume \* 100\)\}%`\)",
            "showOverlay(t('overlay.volumeUp', { value: Math.round(audio.volume * 100) }))",
        ),
        (
            r"showOverlay\(`🔉 音量: \$\{Math\.round\(audio\.volume \* 100\)\}%`\)",
            "showOverlay(t('overlay.volumeDown', { value: Math.round(audio.volume * 100) }))",
        ),
        (
            r"showOverlay\(state\.settings\.showVideo \? '📺 動画表示: ON' : '📺 動画表示: OFF'\)",
            "showOverlay(state.settings.showVideo ? t('overlay.videoOn') : t('overlay.videoOff'))",
        ),
        (
            r"showOverlay\(`🎬 FPS: \$\{nextFps === 0 \? '無制限' : nextFps\}`\)",
            "showOverlay(t('overlay.fps', { fps: nextFps === 0 ? '∞' : nextFps }))",
        ),
        (
            r"showOverlay\(state\.settings\.rainbow \? '🌈 虹色モード: ON' : '🎨 虹色モード: OFF'\)",
            "showOverlay(state.settings.rainbow ? t('overlay.rainbowOn') : t('overlay.rainbowOff'))",
        ),
        (
            r"showOverlay\(state\.settings\.mirror \? '🪞 左右反転: ON' : '🪞 左右反転: OFF'\)",
            "showOverlay(state.settings.mirror ? t('overlay.mirrorOn') : t('overlay.mirrorOff'))",
        ),
        (
            r"showOverlay\(`⏪ 再生速度: \$\{rates\[ni\]\}x`\)",
            "showOverlay(t('overlay.playbackSpeed', { rate: rates[ni] }))",
        ),
        (
            r"showOverlay\(`⏩ 再生速度: \$\{rates\[ni\]\}x`\)",
            "showOverlay(t('overlay.playbackSpeed', { rate: rates[ni] }))",
        ),
        (
            r"showOverlay\('対応するファイルを選択してください'\)",
            "showOverlay(t('overlay.noFileSelected'))",
        ),
        (
            r"showOverlay\(`📥 \$\{accepted\.length\}個のファイルを取り込み中\.\.\.`\)",
            "showOverlay(t('overlay.importingFiles', { count: accepted.length }))",
        ),
        (
            r"showOverlay\(`✅ \$\{accepted\.length\}個のファイルを追加しました`\)",
            "showOverlay(t('overlay.filesAdded', { count: accepted.length }))",
        ),
        (
            r"showOverlay\('❌ ファイル選択に失敗しました'\)",
            "showOverlay(t('overlay.fileSelectFailed'))",
        ),
        (
            r"showOverlay\('この機能はAndroidアプリ版で利用できます'\)",
            "showOverlay(t('overlay.androidOnly'))",
        ),
        (
            r"showOverlay\('📂 フォルダを選択してください'\)",
            "showOverlay(t('overlay.selectFolder'))",
        ),
        (
            r"showOverlay\('フォルダ内に対応ファイルが見つかりませんでした'\)",
            "showOverlay(t('overlay.folderNoFiles'))",
        ),
        (
            r"showOverlay\(`📥 \$\{files\.length\}個のファイルを追加中\.\.\.`\)",
            "showOverlay(t('overlay.importingFiles', { count: files.length }))",
        ),
        (
            r"showOverlay\(`✅ \$\{files\.length\}個のファイルを追加しました`\)",
            "showOverlay(t('overlay.filesAdded', { count: files.length }))",
        ),
        (
            r"showOverlay\(`🎵 EQ: \$\{btn\.textContent\}`\)",
            "showOverlay(t('overlay.eq', { name: btn.textContent }))",
        ),
        (
            r"showOverlay\(`🎬 FPS: \$\{fps === 0 \? '無制限' : fps\}`\)",
            "showOverlay(t('overlay.fps', { fps: fps === 0 ? '∞' : fps }))",
        ),
        (
            r"showOverlay\('音楽の重心を中央にリセット'\)",
            "showOverlay(t('overlay.centerReset'))",
        ),
        (
            r"showOverlay\('💾 ローカル保存: ON'\)",
            "showOverlay(t('overlay.localSaveOn'))",
        ),
        (
            r"showOverlay\(state\.settings\.storeLocalFiles \? '💾 ローカル保存: ON' : '🔗 ローカル保存: OFF \(URIのみ\)'\)",
            "showOverlay(state.settings.storeLocalFiles ? t('overlay.localSaveOn') : t('overlay.localSaveOff'))",
        ),
        (
            r"showOverlay\(`🎨 \$\{p\.name\} カラー適用`\)",
            "showOverlay(t('overlay.colorApplied', { name: p.name }))",
        ),
        (
            r"showOverlay\(`💾 プリセット \$\{slot\} を保存しました`\)",
            "showOverlay(t('overlay.presetSaved', { slot }))",
        ),
        (
            r"showOverlay\(`📂 プリセット \$\{slot\} を読み込みました`\)",
            "showOverlay(t('overlay.presetLoaded', { slot }))",
        ),
        (
            r"showOverlay\('❌ 読み込みに失敗しました'\)",
            "showOverlay(t('overlay.loadFailed'))",
        ),
        (
            r"showOverlay\(`❌ プリセット \$\{slot\} は空です`\)",
            "showOverlay(t('overlay.presetEmpty', { slot }))",
        ),
        (
            r"showOverlay\('✅ 設定を保存しました'\)",
            "showOverlay(t('overlay.settingsSaved'))",
        ),
        (
            r"showOverlay\('🎤 マイク入力開始'\)",
            "showOverlay(t('overlay.micStarted'))",
        ),
        (
            r"showOverlay\(`⚠️ \$\{msg\}`\)",
            "showOverlay(t('overlay.warn', { msg }))",
        ),
        (
            r"showOverlay\(state\.settings\.shuffle \? '🔀 シャッフルON' : '🔀 シャッフルOFF'\)",
            "showOverlay(state.settings.shuffle ? t('overlay.shuffleOn') : t('overlay.shuffleOff'))",
        ),
        (
            r"showOverlay\(labels\[state\.settings\.repeatMode\]\)",
            "showOverlay(getRepeatLabels()[state.settings.repeatMode])",
        ),
        (
            r"showOverlay\(`Now Playing: \$\{track\.name\}`,\s*3000\)",
            "showOverlay(t('overlay.nowPlaying', { title: track.name }), 3000)",
        ),
        (
            r"showOverlay\('⚠️ 再生に失敗しました'\)",
            "showOverlay(t('overlay.playFailed'))",
        ),
        (
            r"showOverlay\('⚠️ URL準備に失敗しました'\)",
            "showOverlay(t('overlay.urlPrepareFailed'))",
        ),
        (
            r"showOverlay\('⚠️ オーディオエラーが発生しました'\)",
            "showOverlay(t('overlay.audioError'))",
        ),
        (
            r"showOverlay\('削除対象がありません'\)",
            "showOverlay(t('overlay.deleteNone'))",
        ),
        (
            r"showOverlay\('🗑️ すべて削除しました'\)",
            "showOverlay(t('overlay.allDeleted'))",
        ),
        (
            r"showOverlay\('プレイリストの順序を変更しました'\)",
            "showOverlay(t('overlay.playlistReordered'))",
        ),
        (
            r"showOverlay\('💤 スリープタイマーで停止しました'\)",
            "showOverlay(t('overlay.sleepStopped'))",
        ),
        (
            r"showOverlay\(`⏰ \$\{minutes\}分後に停止します`\)",
            "showOverlay(t('overlay.sleepStart', { minutes }))",
        ),
        (
            r"showOverlay\('🎬 動画書き出し中\.\.\.'\,\s*0\)",
            "showOverlay(t('overlay.exporting'), 0)",
        ),
        (
            r"showOverlay\('✅ プレイリストをクリアしました'\)",
            "showOverlay(t('overlay.playlistCleared'))",
        ),
        (
            r"alert\('初期化に失敗しました: '\s*\+\s*err\.message\)",
            "alert(t('alert.initFailed', { message: err.message }))",
        ),
        (
            r"alert\('FilePickerプラグインが見つかりません。android-appで依存追加後に `npx cap sync` してください。'\)",
            "alert(t('alert.filePickerMissing'))",
        ),
        (
            r"alert\(`\$\{msg\}: \$\{e\.message\}`\)",
            "alert(`${msg}: ${e.message}`)",
        ),
        (
            r"if\s*\(state\.inputSource\s*===\s*'mic'\)\s*\{\s*alert\('マイク入力モードでは書き出しできません'\);\s*return;\s*\}",
            "if (state.inputSource === 'mic') { alert(t('alert.exportBlockedMic')); return; }",
        ),
        (
            r"alert\('書き出し完了'\)",
            "alert(t('alert.exportComplete'))",
        ),
        (
            r"if\s*\(confirm\('すべての設定、プレイリスト、保存ファイルを削除して初期状態に戻しますか？'\)\)\s*\{",
            "if (confirm(t('confirm.resetAll'))) {",
        ),
        (
            r"if\s*\(confirm\('プレイリストをすべてクリアしますか？'\)\)\s*\{",
            "if (confirm(t('confirm.clearPlaylist'))) {",
        ),
        (
            r"const\s+ok\s*=\s*confirm\('「URIのみ」に切り替えるため、アプリ内に保存済みのローカルファイルをプレイリストから削除しますか？\\n\\n削除すると、再起動後にそれらの曲は復元できなくなります。'\);",
            "const ok = confirm(t('confirm.switchUriMode'));",
        ),
        (
            r"const\s+ok\s*=\s*confirm\('アプリ内に保持しているファイルをすべて削除しますか？\\nプレイリストからも削除されます。'\);",
            "const ok = confirm(t('confirm.deleteStoredFiles'));",
        ),
        (
            r"if\s*\(!confirm\('現在の曲を動画として書き出しますか？'\)\)\s*return;",
            "if (!confirm(t('confirm.exportVideo'))) return;",
        ),
    ]

    for pat, repl in structured:
        text, n = apply_regex_sub(text, pat, repl, flags=re.M)
        total += n

    # Simple literal replacements that may appear in multiple locations
    literals = [
        ("'⏳ 読み込み中...'", "t('status.loading')"),
        ("'待機中...'", "t('status.idle')"),
        ("'再生エラー'", "t('status.playError')"),
        ("'📂 プレイリストを復元しました'", "t('playlist.restored')"),
        ("'プレイリストをクリアしました'", "t('overlay.playlistCleared')"),
        ("'未対応'", "t('common.unsupported')"),
        ("'未再生'", "t('common.unknown')"),
        ("'見つかりませんでした'", "t('playlist.notFound')"),
        ("'曲を追加してください'", "t('playlist.empty')"),
        ("'保存済みのファイルはありません'", "t('storage.empty')"),
        ("'削除対象がありません'", "t('overlay.deleteNone')"),
        ("'開発者メッセージを読み込めませんでした。'", "t('devMessage.loadFailed')"),
        ("'音楽の重心を中央にリセット'", "t('overlay.centerReset')"),
        ("'💤 スリープタイマーで停止しました'", "t('overlay.sleepStopped')"),
        ("'書き出し完了'", "t('alert.exportComplete')"),
    ]
    for old, new in literals:
        text, n = replace_once(text, old, new)
        if n:
            total += 1

    return text, total


def replace_status_and_misc(text: str) -> Tuple[str, int]:
    total = 0

    # status / now playing / playlist / storage / values
    patterns = [
        (r"els\.statusText\.textContent\s*=\s*`🎵 \[\$\{state\.currentIndex \+ 1\}/\$\{state\.playlist\.length\}\] \$\{track\.name\}`;",
         "els.statusText.textContent = t('status.loading');"),
        (r"els\.statusText\.textContent\s*=\s*'⏳ 読み込み中\.\.\.';",
         "els.statusText.textContent = t('status.loading');"),
        (r"els\.statusText\.textContent\s*=\s*'待機中\.\.\.';",
         "els.statusText.textContent = t('status.idle');"),
        (r"els\.statusText\.textContent\s*=\s*'待機中\.';",
         "els.statusText.textContent = t('status.idle');"),
        (r"els\.statusText\.textContent\s*=\s*'再生エラー';",
         "els.statusText.textContent = t('status.playError');"),
        (r"els\.statusText\.textContent\s*=\s*'🎤 マイク入力中';",
         "els.statusText.textContent = t('status.mic');"),
        (r"els\.statusText\.textContent\s*=\s*state\.playlist\[state\.currentIndex\]\s*\?\s*`🎵 \$\{state\.playlist\[state\.currentIndex\]\.name\}`\s*:\s*'待機中\.\.\.';",
         "els.statusText.textContent = state.playlist[state.currentIndex] ? `🎵 ${state.playlist[state.currentIndex].name}` : t('status.idle');"),
        (r"els\.statusText\.textContent\s*=\s*`🎵 \[\$\{index \+ 1\}/\$\{state\.playlist\.length\}\] \$\{track\.name\}`;",
         "els.statusText.textContent = `🎵 [${index + 1}/${state.playlist.length}] ${track.name}`;"),
        (r"els\.statusText\.textContent\s*=\s*`🎵 \[\$\{state\.currentIndex \+ 1\}/\$\{state\.playlist\.length\}\] \$\{track\.name\}`;",
         "els.statusText.textContent = `🎵 [${state.currentIndex + 1}/${state.playlist.length}] ${track.name}`;"),
        (r"els\.nextUpText\.textContent\s*=\s*'次: --';", "els.nextUpText.textContent = t('next.none');"),
        (r"els\.nextUpText\.textContent\s*=\s*`次: \$\{nextTrack\.name\}`;", "els.nextUpText.textContent = t('next.track', { name: nextTrack.name });"),
        (r"els\.playlistItems\.innerHTML\s*=\s*'<div class=\"playlist-empty\">曲を追加してください</div>'\s*;",
         "els.playlistItems.innerHTML = `<div class=\"playlist-empty\">${t('playlist.empty')}</div>`;"),
        (r"els\.playlistItems\.innerHTML\s*=\s*'<div class=\"playlist-empty\">見つかりませんでした</div>'\s*;",
         "els.playlistItems.innerHTML = `<div class=\"playlist-empty\">${t('playlist.notFound')}</div>`;"),
        (r"els\.storageList\.innerHTML\s*=\s*'<div class=\"hint\">保存済みのファイルはありません</div>'\s*;",
         "els.storageList.innerHTML = `<div class=\"hint\">${t('storage.empty')}</div>`;"),
        (r"if\s*\(contentEl\)\s*contentEl\.textContent\s*=\s*'開発者メッセージを読み込めませんでした。';",
         "if (contentEl) contentEl.textContent = t('devMessage.loadFailed');"),
        (r"showOverlay\('⏹ 動画終了により停止しました'\);", "showOverlay(t('overlay.videoEnded'));"),
        (r"showOverlay\('⚠️ 動画の読み込みに失敗しました'\);", "showOverlay(t('overlay.videoLoadFailed'));"),
        (r"showOverlay\('✅ プレイリストをクリアしました'\);", "showOverlay(t('overlay.playlistCleared'));"),
        (r"showOverlay\('🎬 動画書き出し中\.\.\.'\,\s*0\);", "showOverlay(t('overlay.exporting'), 0);"),
        (r"showOverlay\('🎬 動画書き出し中\.\.\.'\)", "showOverlay(t('overlay.exporting'))"),
        (r"showOverlay\(`📥 \$\{accepted\.length\}個のファイルを取り込み中\.\.\.`\)",
         "showOverlay(t('overlay.importingFiles', { count: accepted.length }))"),
        (r"showOverlay\(`✅ \$\{accepted\.length\}個のファイルを追加しました`\)",
         "showOverlay(t('overlay.filesAdded', { count: accepted.length }))"),
        (r"showOverlay\(`📥 \$\{files\.length\}個のファイルを追加中\.\.\.`\)",
         "showOverlay(t('overlay.importingFiles', { count: files.length }))"),
        (r"showOverlay\(`✅ \$\{files\.length\}個のファイルを追加しました`\)",
         "showOverlay(t('overlay.filesAdded', { count: files.length }))"),
        (r"showOverlay\(`🎨 \$\{p\.name\} カラー適用`\)",
         "showOverlay(t('overlay.colorApplied', { name: p.name }))"),
        (r"showOverlay\(`💾 プリセット \$\{slot\} を保存しました`\)",
         "showOverlay(t('overlay.presetSaved', { slot }))"),
        (r"showOverlay\(`📂 プリセット \$\{slot\} を読み込みました`\)",
         "showOverlay(t('overlay.presetLoaded', { slot }))"),
        (r"showOverlay\(`❌ プリセット \$\{slot\} は空です`\)",
         "showOverlay(t('overlay.presetEmpty', { slot }))"),
        (r"showOverlay\('❌ 読み込みに失敗しました'\)", "showOverlay(t('overlay.loadFailed'))"),
        (r"showOverlay\('✅ 設定を保存しました'\)", "showOverlay(t('overlay.settingsSaved'))"),
        (r"showOverlay\('🎤 マイク入力開始'\)", "showOverlay(t('overlay.micStarted'))"),
        (r"showOverlay\(`⚠️ \$\{msg\}`\)", "showOverlay(t('overlay.warn', { msg }))"),
        (r"showOverlay\(`Now Playing: \$\{track\.name\}`,\s*3000\)", "showOverlay(t('overlay.nowPlaying', { title: track.name }), 3000)"),
        (r"showOverlay\('⚠️ 再生に失敗しました'\)", "showOverlay(t('overlay.playFailed'))"),
        (r"showOverlay\('⚠️ URL準備に失敗しました'\)", "showOverlay(t('overlay.urlPrepareFailed'))"),
        (r"showOverlay\('⚠️ オーディオエラーが発生しました'\)", "showOverlay(t('overlay.audioError'))"),
        (r"showOverlay\('削除対象がありません'\)", "showOverlay(t('overlay.deleteNone'))"),
        (r"showOverlay\('🗑️ すべて削除しました'\)", "showOverlay(t('overlay.allDeleted'))"),
        (r"showOverlay\('プレイリストの順序を変更しました'\)", "showOverlay(t('overlay.playlistReordered'))"),
        (r"showOverlay\('💤 スリープタイマーで停止しました'\)", "showOverlay(t('overlay.sleepStopped'))"),
        (r"showOverlay\(`⏰ \$\{minutes\}分後に停止します`\)", "showOverlay(t('overlay.sleepStart', { minutes }))"),
        (r"showOverlay\(`⏪ 再生速度: \$\{rates\[ni\]\}x`\)", "showOverlay(t('overlay.playbackSpeed', { rate: rates[ni] }))"),
        (r"showOverlay\(`⏩ 再生速度: \$\{rates\[ni\]\}x`\)", "showOverlay(t('overlay.playbackSpeed', { rate: rates[ni] }))"),
        (r"showOverlay\(`🎬 FPS: \$\{fps === 0 \? '無制限' : fps\}`\)", "showOverlay(t('overlay.fps', { fps: fps === 0 ? '∞' : fps }))"),
        (r"showOverlay\(`🎬 FPS: \$\{nextFps === 0 \? '無制限' : nextFps\}`\)", "showOverlay(t('overlay.fps', { fps: nextFps === 0 ? '∞' : nextFps }))"),
        (r"showOverlay\(state\.settings\.showVideo \? '📺 動画表示: ON' : '📺 動画表示: OFF'\)",
         "showOverlay(state.settings.showVideo ? t('overlay.videoOn') : t('overlay.videoOff'))"),
        (r"showOverlay\(state\.settings\.rainbow \? '🌈 虹色モード: ON' : '🎨 虹色モード: OFF'\)",
         "showOverlay(state.settings.rainbow ? t('overlay.rainbowOn') : t('overlay.rainbowOff'))"),
        (r"showOverlay\(state\.settings\.mirror \? '🪞 左右反転: ON' : '🪞 左右反転: OFF'\)",
         "showOverlay(state.settings.mirror ? t('overlay.mirrorOn') : t('overlay.mirrorOff'))"),
        (r"showOverlay\(state\.settings\.shuffle \? '🔀 シャッフルON' : '🔀 シャッフルOFF'\)",
         "showOverlay(state.settings.shuffle ? t('overlay.shuffleOn') : t('overlay.shuffleOff'))"),
        (r"showOverlay\(labels\[state\.settings\.repeatMode\]\)", "showOverlay(getRepeatLabels()[state.settings.repeatMode])"),
        (r"if\s*\(!confirm\(t\('confirm\.exportVideo'\)\)\)\s*return;", "if (!confirm(t('confirm.exportVideo'))) return;"),
        (r"if\s*\(confirm\(t\('confirm\.resetAll'\)\)\)\s*\{", "if (confirm(t('confirm.resetAll'))) {"),
        (r"if\s*\(confirm\(t\('confirm\.clearPlaylist'\)\)\)\s*\{", "if (confirm(t('confirm.clearPlaylist'))) {"),
    ]

    for pat, repl in patterns:
        text, n = apply_regex_sub(text, pat, repl, flags=re.M)
        total += n

    # Simple text replacements for values and labels
    text = text.replace("const modeName = e.target.options[e.target.selectedIndex].text;\n        showOverlay(`📊 モード: ${modeName}`);",
                        "const modeName = e.target.options[e.target.selectedIndex].text;\n        showOverlay(t('overlay.mode', { mode: modeName }));")
    text = text.replace("const modeName = els.modeSelect.options[els.modeSelect.selectedIndex].text;\n                showOverlay(`📊 モード: ${modeName}`);",
                        "const modeName = els.modeSelect.options[els.modeSelect.selectedIndex].text;\n                showOverlay(t('overlay.mode', { mode: modeName }));")
    text = text.replace("showOverlay(`📊 モード: ${modeName}`);", "showOverlay(t('overlay.mode', { mode: modeName }));")
    text = text.replace("els.statusText.textContent = '待機中...';", "els.statusText.textContent = t('status.idle');")
    text = text.replace("els.statusText.textContent = '待機中.';", "els.statusText.textContent = t('status.idle');")
    text = text.replace("els.statusText.textContent = '⏳ 読み込み中...';", "els.statusText.textContent = t('status.loading');")
    text = text.replace("els.statusText.textContent = '再生エラー';", "els.statusText.textContent = t('status.playError');")
    text = text.replace("els.statusText.textContent = '🎤 マイク入力中';", "els.statusText.textContent = t('status.mic');")
    text = text.replace("els.nextUpText.textContent = '次: --';", "els.nextUpText.textContent = t('next.none');")
    text = text.replace("els.storageSummary.textContent = '';", "els.storageSummary.textContent = '';")
    text = text.replace("memoryEl.textContent = '未対応';", "memoryEl.textContent = t('common.unsupported');")
    text = text.replace("if (label) label.textContent = 'C';", "if (label) label.textContent = 'C';")
    text = text.replace("btn.textContent = p.name;", "btn.textContent = p.name;")
    text = text.replace("showOverlay('対応するファイルを選択してください');", "showOverlay(t('overlay.noFileSelected'));")
    text = text.replace("showOverlay('❌ ファイル選択に失敗しました');", "showOverlay(t('overlay.fileSelectFailed'));")
    text = text.replace("showOverlay('この機能はAndroidアプリ版で利用できます');", "showOverlay(t('overlay.androidOnly'));")
    text = text.replace("showOverlay('📂 フォルダを選択してください');", "showOverlay(t('overlay.selectFolder'));")
    text = text.replace("showOverlay('フォルダ内に対応ファイルが見つかりませんでした');", "showOverlay(t('overlay.folderNoFiles'));")
    text = text.replace("showOverlay('音楽の重心を中央にリセット');", "showOverlay(t('overlay.centerReset'));")
    text = text.replace("showOverlay('💾 ローカル保存: ON');", "showOverlay(t('overlay.localSaveOn'));")
    text = text.replace("showOverlay('書き出し完了');", "alert(t('alert.exportComplete'));")
    text = text.replace("alert('書き出し完了');", "alert(t('alert.exportComplete'));")
    text = text.replace("alert('マイク入力モードでは書き出しできません');", "alert(t('alert.exportBlockedMic'));")
    text = text.replace("alert('FilePickerプラグインが見つかりません。android-appで依存追加後に `npx cap sync` してください。');", "alert(t('alert.filePickerMissing'));")
    text = text.replace("contentEl.textContent = '開発者メッセージを読み込めませんでした。';", "contentEl.textContent = t('devMessage.loadFailed');")
    text = text.replace("els.playlistItems.innerHTML = '<div class=\"playlist-empty\">曲を追加してください</div>'; ", "els.playlistItems.innerHTML = `<div class=\"playlist-empty\">${t('playlist.empty')}</div>`;")
    text = text.replace("els.playlistItems.innerHTML = '<div class=\"playlist-empty\">見つかりませんでした</div>';", "els.playlistItems.innerHTML = `<div class=\"playlist-empty\">${t('playlist.notFound')}</div>`;")
    text = text.replace("els.storageList.innerHTML = '<div class=\"hint\">保存済みのファイルはありません</div>';", "els.storageList.innerHTML = `<div class=\"hint\">${t('storage.empty')}</div>`;")
    text = text.replace("if (state.inputSource === 'mic') { alert('マイク入力モードでは書き出しできません'); return; }",
                        "if (state.inputSource === 'mic') { alert(t('alert.exportBlockedMic')); return; }")
    text = text.replace("if (contentEl) contentEl.textContent = '開発者メッセージを読み込めませんでした。';",
                        "if (contentEl) contentEl.textContent = t('devMessage.loadFailed');")
    text = text.replace("els.statusText.textContent = `🎵 [${state.currentIndex + 1}/${state.playlist.length}] ${track.name}`;",
                        "els.statusText.textContent = `🎵 [${state.currentIndex + 1}/${state.playlist.length}] ${track.name}`;")
    text = text.replace("els.statusText.textContent = `🎵 [${index + 1}/${state.playlist.length}] ${track.name}`;",
                        "els.statusText.textContent = `🎵 [${index + 1}/${state.playlist.length}] ${track.name}`;")
    text = text.replace("els.nextUpText.textContent = `次: ${nextTrack.name}`;",
                        "els.nextUpText.textContent = t('next.track', { name: nextTrack.name });")

    return text, total


def insert_or_replace_translations(text: str) -> Tuple[str, int]:
    """
    If I18N exists already, merge missing keys by injecting a small helper block.
    This keeps the script self-contained and avoids accidental partial edits.
    """
    marker = "// ============== I18N FUNCTIONS =============="
    if marker not in text:
        return text, 0
    # Do not rewrite the existing dictionary automatically; the source already has one.
    # The migration script is intended to patch script.js, not regenerate its whole i18n block.
    return text, 0


def migrate_source(source: str) -> Tuple[str, Dict[str, int]]:
    stats: Dict[str, int] = {}
    steps = [
        ("upgrade_t", upgrade_t_function),
        ("replace_labels", replace_labels),
        ("replace_text_literals", replace_text_literals),
        ("replace_status_and_misc", replace_status_and_misc),
    ]
    for name, fn in steps:
        source, n = fn(source)
        stats[name] = n
    return source, stats


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate Audio Visualizer JS strings to i18n.")
    parser.add_argument("--input", "-i", type=Path, required=True, help="Path to script.js")
    parser.add_argument("--output", "-o", type=Path, help="Output path. Defaults to <input>.i18n.js")
    parser.add_argument("--inplace", action="store_true", help="Overwrite input file in place")
    args = parser.parse_args()

    src_path: Path = args.input
    if not src_path.exists():
        raise FileNotFoundError(f"Input file not found: {src_path}")

    out_path = src_path if args.inplace else (args.output or src_path.with_suffix(".i18n.js"))

    original = src_path.read_text(encoding="utf-8")
    migrated, stats = migrate_source(original)

    out_path.write_text(migrated, encoding="utf-8")

    print("Done.")
    print(f"Input : {src_path}")
    print(f"Output: {out_path}")
    print("Stats :")
    for k, v in stats.items():
        print(f"  - {k}: {v}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
