import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { ValidationIssue } from '../types';
import { applyScenarioSchema, MODEL_URI, monaco } from '../monaco/setup';

export interface CodeEditorHandle {
  revealLine: (line: number) => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** 백엔드 검증 결과 (참조 오류 등) 를 줄 표시로 */
  issues: ValidationIssue[];
  schema: object | null;
  onSave?: () => void;
}

const isDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

// FE-EDT-05: Monaco YAML 에디터 (React.lazy 로만 불러올 것)
const CodeEditor = forwardRef<CodeEditorHandle, Props>(function CodeEditor({ value, onChange, issues, schema, onSave }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const callbacks = useRef({ onChange, onSave });
  callbacks.current = { onChange, onSave };

  useEffect(() => {
    // 같은 URI 모델이 남아 있으면 재사용 (StrictMode 이중 마운트 대비)
    const model = monaco.editor.getModel(MODEL_URI) ?? monaco.editor.createModel(value, 'yaml', MODEL_URI);
    model.setValue(value);
    const editor = monaco.editor.create(hostRef.current!, {
      model,
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      tabSize: 2,
      insertSpaces: true,
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      theme: isDark() ? 'vs-dark' : 'vs',
      quickSuggestions: { other: true, comments: false, strings: true },
    });
    editorRef.current = editor;
    const sub = model.onDidChangeContent(() => callbacks.current.onChange(model.getValue()));
    // Ctrl/Cmd + S 저장
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => callbacks.current.onSave?.());
    return () => {
      sub.dispose();
      editor.dispose();
      model.dispose();
      editorRef.current = null;
    };
    // 최초 값만 사용. 이후 변경은 아래 effect 에서 반영
  }, []);

  // 외부에서 값이 바뀐 경우 (불러오기 완료 등) 에만 덮어쓴다
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model && model.getValue() !== value) model.setValue(value);
  }, [value]);

  useEffect(() => {
    if (schema) applyScenarioSchema(schema);
  }, [schema]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      'wtg',
      issues
        .filter((i) => i.line)
        .map((i) => {
          const line = Math.min(i.line!, model.getLineCount());
          return {
            startLineNumber: line,
            endLineNumber: line,
            startColumn: model.getLineFirstNonWhitespaceColumn(line) || 1,
            endColumn: model.getLineMaxColumn(line),
            message: `${i.message}${i.path ? ` (${i.path})` : ''}`,
            severity: i.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          };
        }),
    );
  }, [issues]);

  useImperativeHandle(ref, () => ({
    revealLine(line: number) {
      const editor = editorRef.current;
      if (!editor) return;
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    },
  }));

  return <div ref={hostRef} className="code-editor" aria-label="시나리오 YAML 편집기" />;
});

export default CodeEditor;
