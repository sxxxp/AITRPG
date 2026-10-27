import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { configureMonacoYaml, type MonacoYaml, type MonacoYamlOptions, type SchemasSettings } from 'monaco-yaml';
import YamlWorker from './yaml.worker?worker';

// Monaco 는 에디터 화면에서만 동적으로 불러온다 (메인 번들에 포함되지 않음)

export const MODEL_URI = monaco.Uri.parse('file:///scenario.yaml');

window.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    if (label === 'yaml') return new YamlWorker();
    return new EditorWorker();
  },
};

let yaml: MonacoYaml | null = null;

/** 시나리오 JSON Schema 로 자동완성/툴팁/구조 검사를 켠다 (BE-SCN-11 응답) */
export function applyScenarioSchema(schema: object) {
  const options: MonacoYamlOptions = {
    enableSchemaRequest: false,
    schemas: [
      {
        uri: 'wtg://schemas/scenario.json',
        fileMatch: [MODEL_URI.toString()],
        schema: schema as SchemasSettings['schema'],
      },
    ],
  };
  if (yaml) yaml.update(options);
  else yaml = configureMonacoYaml(monaco, options);
}

export { monaco };
