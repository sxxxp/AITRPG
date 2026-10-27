import * as Blockly from 'blockly/core';
import * as Ko from 'blockly/msg/ko';
import { forwardRef, useEffect, useImperativeHandle, useRef, type MutableRefObject } from 'react';
import { rebuildCatalog, refsFromWorkspace } from './catalog';
import { blocksToScenario, preservedNote, scenarioToBlocks, type BlockJson, type WorkspaceJson } from './convert';
import { registerScenarioBlocks, TOOLBOX } from './definitions';

type Obj = Record<string, unknown>;

export interface BlockWorkspaceHandle {
  /** 검증 오류 경로(예: scenes.gate.objects.bush.on_examine.success.1)에 해당하는 블록을 선택. 찾으면 true */
  focusPath: (path: string) => boolean;
}

interface Props {
  /** 처음 불러올 시나리오 (마운트할 때 한 번만 사용) */
  initial: Obj;
  /** 블록이 다루지 않는 부분(기본 정보 등)의 최신값 */
  baseRef: MutableRefObject<Obj>;
  onChange: (scenario: Obj) => void;
}

const CHANGE_DELAY_MS = 400;

let localeSet = false;

function darkTheme() {
  return Blockly.Theme.defineTheme('wtg-dark', {
    name: 'wtg-dark',
    base: Blockly.Themes.Zelos,
    componentStyles: {
      workspaceBackgroundColour: '#1f1e24',
      toolboxBackgroundColour: '#2a2930',
      toolboxForegroundColour: '#ecebf0',
      flyoutBackgroundColour: '#2a2930',
      flyoutForegroundColour: '#ecebf0',
      flyoutOpacity: 0.95,
      scrollbarColour: '#55525c',
      insertionMarkerColour: '#ffffff',
    },
  });
}

/** 보관된 설정이 있는 블록과 문제가 있는 블록에 경고 표시 */
function updateWarnings(ws: Blockly.WorkspaceSvg, problems: Map<string, string>) {
  for (const block of ws.getAllBlocks(false)) {
    const note = problems.get(block.id) ?? preservedNote({ type: block.type, data: block.data ?? undefined } as BlockJson);
    block.setWarningText(note);
  }
}

// FE-EDT-09 (블록 모드). React.lazy 로만 불러올 것
const BlockWorkspace = forwardRef<BlockWorkspaceHandle, Props>(function BlockWorkspace({ initial, baseRef, onChange }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const pathsRef = useRef<Record<string, string>>({});
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    registerScenarioBlocks();
    if (!localeSet) {
      Blockly.setLocale(Ko as unknown as Record<string, string>);
      localeSet = true;
    }
    rebuildCatalog(initial);

    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const ws = Blockly.inject(hostRef.current!, {
      toolbox: TOOLBOX,
      renderer: 'zelos',
      theme: dark ? darkTheme() : Blockly.Themes.Zelos,
      trashcan: true,
      sounds: false,
      zoom: { controls: true, wheel: true, startScale: 0.75, maxScale: 2, minScale: 0.3 },
      move: { scrollbars: true, drag: true, wheel: false },
      grid: { spacing: 24, length: 2, colour: dark ? '#36343d' : '#e2dfd8', snap: true },
    });
    wsRef.current = ws;

    // 불러오는 동안의 이벤트는 '편집'이 아니므로 끈다
    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(scenarioToBlocks(initial) as object, ws);
      ws.cleanUp();
      updateWarnings(ws, new Map());
    } finally {
      Blockly.Events.enable();
    }
    pathsRef.current = blocksToScenario(Blockly.serialization.workspaces.save(ws) as WorkspaceJson, baseRef.current).paths;

    let timer: number | undefined;
    const listener = (e: Blockly.Events.Abstract) => {
      if (e.isUiEvent) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const json = Blockly.serialization.workspaces.save(ws) as WorkspaceJson;
        const result = blocksToScenario(json, baseRef.current);
        pathsRef.current = result.paths;
        rebuildCatalog(result.scenario, refsFromWorkspace(json));
        Blockly.Events.disable();
        try {
          updateWarnings(ws, new Map(result.problems.map((p) => [p.blockId, p.message])));
        } finally {
          Blockly.Events.enable();
        }
        onChangeRef.current(result.scenario);
      }, CHANGE_DELAY_MS);
    };
    ws.addChangeListener(listener);

    const resize = new ResizeObserver(() => Blockly.svgResize(ws));
    resize.observe(hostRef.current!);

    return () => {
      window.clearTimeout(timer);
      resize.disconnect();
      ws.dispose();
      wsRef.current = null;
    };
    // 최초 시나리오만 사용 (다시 불러오려면 key 를 바꿔 다시 마운트)
  }, []);

  useImperativeHandle(ref, () => ({
    focusPath(path: string) {
      const ws = wsRef.current;
      if (!ws) return false;
      const key = Object.keys(pathsRef.current)
        .filter((k) => path === k || path.startsWith(`${k}.`))
        .sort((a, b) => b.length - a.length)[0];
      const block = key ? ws.getBlockById(pathsRef.current[key]) : null;
      if (!block) return false;
      block.select();
      ws.centerOnBlock(block.id);
      return true;
    },
  }));

  return <div ref={hostRef} className="block-workspace" aria-label="시나리오 블록 편집기" />;
});

export default BlockWorkspace;
