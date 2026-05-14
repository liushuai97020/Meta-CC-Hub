/**
 * 左侧边栏组件
 * 项目维度管理：每个项目包含多个会话，展示最近项目列表
 */
import React, { useState, useEffect, useCallback } from "react";
import { cn } from "../utils/cn";
import { useSessionStore } from "../stores/sessionStore";
import { useAppStore } from "../stores/appStore";
import {
  Plus,
  MessageSquare,
  Trash2,
  Folder,
  FolderOpen,
  FolderGit2,
  File,
  FileCode,
  FileJson,
  ChevronRight,
  ChevronDown,
  Settings,
} from "lucide-react";
import { Button } from "./ui/button";

// ========================
// 文件树组件
// ========================

interface FileTreeNodeProps {
  entry: FileSystemEntry;
  depth: number;
  onSelectFile: (path: string) => void;
  selectedFile: string | null;
}

/**
 * 文件树节点组件
 */
const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  entry,
  depth,
  onSelectFile,
  selectedFile,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileSystemEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleExpand = async () => {
    if (entry.isDirectory) {
      if (!expanded) {
        setLoading(true);
        try {
          const result = await window.electronAPI.fs.readDirectory(entry.path);
          if (result.success && result.data) {
            setChildren(result.data);
          }
        } catch (error) {
          console.error("Failed to read directory:", error);
        }
        setLoading(false);
      }
      setExpanded(!expanded);
    }
  };

  const handleClick = () => {
    if (entry.isFile) {
      onSelectFile(entry.path);
    } else {
      toggleExpand();
    }
  };

  const getFileIcon = (filename: string) => {
    if (filename.endsWith(".ts") || filename.endsWith(".tsx"))
      return <FileCode className="h-4 w-4 text-blue-400" />;
    if (filename.endsWith(".js") || filename.endsWith(".jsx"))
      return <FileCode className="h-4 w-4 text-yellow-400" />;
    if (filename.endsWith(".json"))
      return <FileJson className="h-4 w-4 text-green-400" />;
    if (filename.endsWith(".css") || filename.endsWith(".scss"))
      return <FileCode className="h-4 w-4 text-pink-400" />;
    if (filename.endsWith(".html"))
      return <FileCode className="h-4 w-4 text-orange-400" />;
    return <File className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1 cursor-pointer rounded-sm text-sm hover:bg-accent",
          selectedFile === entry.path && "bg-accent text-accent-foreground",
          depth > 0 && "ml-4",
        )}
        onClick={handleClick}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {entry.isDirectory ? (
          <>
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <Folder className="h-4 w-4 text-primary shrink-0" />
            )}
          </>
        ) : (
          <span className="w-5 shrink-0">{getFileIcon(entry.name)}</span>
        )}
        <span className="truncate">{entry.name}</span>
        {loading && (
          <span className="text-xs text-muted-foreground ml-1">...</span>
        )}
      </div>
      {expanded && children.length > 0 && (
        <div>
          {children
            .sort((a, b) => {
              if (a.isDirectory && !b.isDirectory) return -1;
              if (!a.isDirectory && b.isDirectory) return 1;
              return a.name.localeCompare(b.name);
            })
            .map((child) => (
              <FileTreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                onSelectFile={onSelectFile}
                selectedFile={selectedFile}
              />
            ))}
        </div>
      )}
    </div>
  );
};

// ========================
// 会话列表组件
// ========================

interface SessionListProps {
  sessions: SessionData[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const SessionList: React.FC<SessionListProps> = ({
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
}) => {
  return (
    <div className="space-y-0.5">
      {sessions.map((session) => (
        <div
          key={session.id}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 cursor-pointer rounded-md text-sm group hover:bg-accent",
            activeSessionId === session.id &&
              "bg-accent text-accent-foreground",
          )}
          onClick={() => onSelect(session.id)}
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-xs">{session.title}</span>
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive/20 rounded transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(session.id);
            }}
            title="删除"
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </button>
        </div>
      ))}
    </div>
  );
};

// ========================
// 主侧边栏组件
// ========================

type SidebarTab = "sessions" | "files";

const Sidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SidebarTab>("sessions");
  const [fileTree, setFileTree] = useState<FileSystemEntry[]>(
    () => useAppStore.getState().currentProjectPath
      ? useAppStore.getState().getFileTreeCache(useAppStore.getState().currentProjectPath!)
      : []
  );
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(),
  );
  // 本地项目列表，作为 store 的兜底，确保 UI 即时刷新
  const [displayProjects, setDisplayProjects] = useState<string[]>(
    () => useAppStore.getState().recentProjects,
  );

  const {
    sessions,
    activeSessionId,
    initialized,
    loadSessions,
    createSession,
    deleteSession,
    setActiveSession,
  } = useSessionStore();

  const {
    sidebarOpen,
    currentProjectPath,
    loadRecentProjects,
    openProject,
    removeRecentProject,
    setCurrentProjectPath,
    addDiagnostic,
    setCodePreview,
    setRightPanelTab,
    setRightPanelOpen,
  } = useAppStore();

  // 初始化：加载会话 + 同步 store 中的项目列表到本地
  useEffect(() => {
    if (!initialized) loadSessions();
    loadRecentProjects().then(() => {
      setDisplayProjects(useAppStore.getState().recentProjects);
    });
  }, [initialized, loadSessions, loadRecentProjects]);

  // 当 store 中的 recentProjects 变化时同步到本地
  useEffect(() => {
    const unsub = useAppStore.subscribe((state) => {
      setDisplayProjects(state.recentProjects);
    });
    return unsub;
  }, []);

  // 当切换项目时加载文件树（优先使用缓存）
  const loadFileTree = useCallback(async (projectPath: string) => {
    // 先检查缓存
    const cached = useAppStore.getState().getFileTreeCache(projectPath);
    if (cached.length > 0) {
      setFileTree(cached);
      return;
    }
    try {
      const result = await window.electronAPI.fs.readDirectory(projectPath);
      if (result.success && result.data) {
        setFileTree(result.data);
        useAppStore.getState().setFileTreeCache(projectPath, result.data);
      }
    } catch {
      setFileTree([]);
    }
  }, []);

  // 当前项目路径变化时自动加载文件树（从缓存或磁盘）
  useEffect(() => {
    if (currentProjectPath) {
      loadFileTree(currentProjectPath);
    }
  }, [currentProjectPath, loadFileTree]);

  // 打开新项目（弹出系统目录选择器，自动添加到项目区域并展开）
  const handleOpenNewProject = useCallback(async () => {
    const path = await openProject();
    if (!path) return;
    // 更新本地状态，确保 UI 即时刷新
    const fresh = await window.electronAPI.projects.getRecent();
    setDisplayProjects(fresh);
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, [openProject]);

  // 选择文件
  const handleSelectFile = useCallback(
    async (path: string) => {
      setSelectedFile(path);
      const result = await window.electronAPI.fs.readFile(path);
      if (result.success && result.data) {
        setFileContent(result.data);
        setCodePreview(path, result.data);
        // 预览选项卡时不自动切换到代码 tab
        const currentTab = useAppStore.getState().rightPanelTab;
        if (currentTab !== "preview") {
          setRightPanelTab("code");
        }
        setRightPanelOpen(true);
      }
    },
    [setCodePreview, setRightPanelTab, setRightPanelOpen],
  );

  // 展开/折叠项目
  const toggleProject = useCallback((projectPath: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectPath)) next.delete(projectPath);
      else next.add(projectPath);
      return next;
    });
  }, []);

  // 在指定项目下创建新会话
  const handleCreateSession = useCallback(
    async (projectPath: string) => {
      setCurrentProjectPath(projectPath);
      const projectName = projectPath.split(/[/\\]/).pop() || "项目";
      await createSession(
        `${projectName} - ${new Date().toLocaleTimeString()}`,
      );
    },
    [setCurrentProjectPath, createSession],
  );

  // 从最近列表中移除项目
  const handleDeleteProject = useCallback(
    async (projectPath: string) => {
      await removeRecentProject(projectPath);
      setDisplayProjects((prev) => prev.filter((p) => p !== projectPath));
      setExpandedProjects((prev) => {
        const next = new Set(prev);
        next.delete(projectPath);
        return next;
      });
    },
    [removeRecentProject],
  );

  // 获取指定项目的会话
  const getSessionsForProject = useCallback(
    (projectPath: string) => {
      return sessions.filter((s) => s.projectPath === projectPath);
    },
    [sessions],
  );

  if (!sidebarOpen) return null;

  return (
    <div
      className="panel flex flex-col h-full overflow-hidden mt-8"
      style={{ width: 'var(--sidebar-width, 280px)', minWidth: "200px" }}
    >
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          className={cn(
            "flex-1 px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "sessions"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveTab("sessions")}
        >
          项目
        </button>
        <button
          className={cn(
            "flex-1 px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "files"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setActiveTab("files")}
        >
          文件
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "sessions" ? (
          <div className="p-2 space-y-2">
            {/* 新建项目按钮 */}
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-accent/30 transition-colors text-muted-foreground hover:text-foreground"
              onClick={handleOpenNewProject}
            >
              <Plus className="h-4 w-4" />
              新建项目
            </button>

            {/* 项目卡片列表 */}
            {displayProjects.length > 0 ? (
              displayProjects.slice(0, 10).map((projectPath) => {
                const projectName =
                  projectPath.split(/[/\\]/).pop() || projectPath;
                const projectSessions = getSessionsForProject(projectPath);
                const isExpanded = expandedProjects.has(projectPath);

                // 按更新时间倒序，最多10条会话
                const recentSessions = [...projectSessions]
                  .sort(
                    (a, b) =>
                      new Date(b.updatedAt).getTime() -
                      new Date(a.updatedAt).getTime(),
                  )
                  .slice(0, 10);

                const isActiveProject = currentProjectPath === projectPath;

                return (
                  <div
                    key={projectPath}
                    className={cn(
                      "rounded-lg border overflow-hidden bg-card transition-shadow hover:shadow-sm",
                      isActiveProject
                        ? "border-primary/40 shadow-sm shadow-primary/10"
                        : "border-border",
                    )}
                  >
                    {/* 卡点头部：左侧点击切换区域 + 右侧操作按钮 */}
                    <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                      <button
                        type="button"
                        className="flex-1 min-w-0 text-left"
                        onClick={() => {
                          setCurrentProjectPath(projectPath);
                          toggleProject(projectPath);
                        }}
                      >
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <FolderGit2 className={cn("h-4 w-4 shrink-0", isActiveProject ? "text-primary" : "text-primary/70")} />
                          <span className={cn("truncate", isActiveProject && "text-primary font-semibold")}>{projectName}</span>
                          {isActiveProject && <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">当前</span>}
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform",
                              isExpanded && "rotate-90",
                            )}
                          />
                        </div>
                        <div className="mt-1 truncate text-[11px] text-muted-foreground/60">
                          {projectPath}
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreateSession(projectPath);
                          }}
                          title="新建会话"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(projectPath);
                          }}
                          title="删除此项目及其所有会话"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 展开的会话列表 */}
                    {isExpanded && (
                      <div className="border-t border-border px-1 pb-2">
                        {recentSessions.length > 0 ? (
                          <div className="flex flex-col gap-0.5 pt-1">
                            {recentSessions.map((session) => (
                              <div
                                key={session.id}
                                className={cn(
                                  "flex items-center gap-2 px-2.5 py-1.5 cursor-pointer rounded-md group",
                                  "hover:bg-accent transition-colors",
                                  activeSessionId === session.id &&
                                    "bg-accent text-accent-foreground",
                                )}
                                onClick={() => setActiveSession(session.id)}
                              >
                                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="flex-1 truncate text-xs">
                                  {session.title}
                                </span>
                                <button
                                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive/20 rounded transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteSession(session.id);
                                  }}
                                  title="删除会话"
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-3">
                            <p className="text-xs text-muted-foreground">
                              暂无会话
                            </p>
                            <button
                              className="mt-1 text-xs text-primary hover:text-primary/80"
                              onClick={() => handleCreateSession(projectPath)}
                            >
                              创建第一个会话
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8">
                <FolderOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">还没有项目</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  点击上方「新建项目」添加
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-2">
            {/* 选择目录 */}
            {/* <div className="flex items-center gap-2 mb-3 px-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs flex-1"
                onClick={async () => {
                  const path = await openProject();
                  if (path) {
                    setCurrentProjectPath(path);
                    await loadFileTree(path);
                  }
                }}
              >
                <Folder className="h-3.5 w-3.5 mr-1" />
                {currentProjectPath ? "切换目录" : "打开项目"}
              </Button>
            </div> */}

            {currentProjectPath && (
              <div className="text-xs text-muted-foreground truncate mb-2 px-1">
                {currentProjectPath}
              </div>
            )}

            {/* 文件树 */}
            {fileTree.length > 0 ? (
              <div>
                {fileTree
                  .sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map((entry) => (
                    <FileTreeNode
                      key={entry.path}
                      entry={entry}
                      depth={0}
                      onSelectFile={handleSelectFile}
                      selectedFile={selectedFile}
                    />
                  ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FolderGit2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  打开一个项目查看文件
                </p>
              </div>
            )}

            {/* 文件内容预览 */}
            {/* {fileContent && selectedFile && (
              <div className="mt-4 border-t border-border pt-3">
                <div className="text-xs font-medium text-muted-foreground mb-2 truncate flex items-center justify-between">
                  <span>{selectedFile}</span>
                  <button
                    className="text-primary hover:text-primary/80 text-xs flex items-center gap-1"
                    onClick={() => {
                      setCodePreview(selectedFile, fileContent);
                      setRightPanelTab("code");
                      setRightPanelOpen(true);
                    }}
                    title="在右侧面板打开"
                  >
                    ↗ 展开
                  </button>
                </div>
                <div className="relative group">
                  <pre className="text-xs bg-editor-bg p-2 rounded-md overflow-x-auto max-h-48 border border-editor-border">
                    <code className="language-highlight">{fileContent}</code>
                  </pre>
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded shadow-md hover:bg-primary/90"
                      onClick={() => {
                        const selection = window.getSelection()?.toString();
                        const selectedText = selection?.trim() || "";
                        if (selectedText && activeSessionId) {
                          useSessionStore
                            .getState()
                            .addMessage(activeSessionId, {
                              role: "user",
                              content: `文件: ${selectedFile}\n\`\`\`\n${selectedText}\n\`\`\``,
                            });
                          addDiagnostic({
                            status: "success",
                            message: "已发送选中代码到会话",
                            timestamp: new Date().toISOString(),
                          });
                        }
                      }}
                      title="发送选中内容到当前会话"
                    >
                      发送选中
                    </button>
                    <button
                      className="bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded shadow-md hover:bg-secondary/80"
                      onClick={() => {
                        navigator.clipboard.writeText(fileContent);
                        addDiagnostic({
                          status: "success",
                          message: "已复制文件内容",
                          timestamp: new Date().toISOString(),
                        });
                      }}
                      title="复制全部"
                    >
                      复制
                    </button>
                  </div>
                </div>
              </div>
            )} */}
          </div>
        )}
      </div>

      {/* 底部设置按钮 */}
      <div className="border-t border-border p-2">
        <button
          className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          onClick={() => useAppStore.getState().toggleSettings()}
          title="设置"
        >
          <Settings className="h-4 w-4" />
          设置
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
