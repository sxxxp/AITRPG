import * as Blockly from 'blockly/core';
import { options, secretOptions, type RefKind } from './catalog';

// 시나리오 블록 정의. 필드/입력 이름은 convert.ts 와 맞춰야 한다.

const HUE = {
  scene: 210,
  object: 195,
  exit: 175,
  item: 40,
  npc: 290,
  event: 330,
  enemy: 0,
  ending: 260,
  branch: 120,
  op: 150,
  cond: 65,
};

type B = Blockly.Block;

const ID_RE = /[^a-z0-9_]/g;
/** ID 입력값을 snake_case 로 정리 (대문자 → 소문자, 그 외 문자 → _) */
const idValidator = (v: string) => {
  const cleaned = v.toLowerCase().replace(ID_RE, '_');
  return /^[a-z]/.test(cleaned) ? cleaned : cleaned ? `x_${cleaned}` : null;
};

const text = (value = '') => new Blockly.FieldTextInput(value);
const id = (value: string) => new Blockly.FieldTextInput(value, idValidator);
const num = (value = 0, min?: number) => new Blockly.FieldNumber(value, min, undefined, 1);
const check = (value = false) => new Blockly.FieldCheckbox(value ? 'TRUE' : 'FALSE');
const ref = (kind: RefKind) => new Blockly.FieldDropdown(() => options(kind));

/**
 * 같은 블록의 NPC 필드에 따라 선택지가 바뀌는 비밀 드롭다운.
 * Blockly 는 블록을 만들 때(NPC 가 비어 있을 때) 선택지를 캐시해 값 검증에 쓰므로,
 * 검증 전에 선택지를 새로 만들어야 저장된 시나리오를 불러올 때 값이 버려지지 않는다.
 */
class SecretDropdown extends Blockly.FieldDropdown {
  constructor() {
    super(function (this: Blockly.FieldDropdown) {
      return secretOptions(this.getSourceBlock()?.getFieldValue('NPC') ?? '');
    });
  }

  protected override doClassValidation_(newValue?: string): string | null {
    this.getOptions(false);
    return super.doClassValidation_(newValue);
  }
}

/** NPC 를 바꾸면 이전 NPC 의 비밀은 맞지 않으므로 비밀 선택을 비운다 */
function npcForSecret() {
  return new Blockly.FieldDropdown(
    () => options('npcs'),
    function (this: Blockly.FieldDropdown, next: string) {
      const block = this.getSourceBlock();
      if (block && next !== this.getValue() && block.getField('SECRET')) block.setFieldValue('', 'SECRET');
      return next;
    },
  );
}
const choice = (opts: [string, string][]) => new Blockly.FieldDropdown(opts);

const CMP_OPTIONS: [string, string][] = [
  ['≥', '>='],
  ['≤', '<='],
  ['>', '>'],
  ['<', '<'],
  ['=', '=='],
  ['≠', '!='],
];

function define(type: string, init: (this: B) => void) {
  Blockly.Blocks[type] = { init };
}

function op(type: string, init: (this: B) => void, tooltip: string) {
  define(type, function () {
    init.call(this);
    this.setPreviousStatement(true, 'op');
    this.setNextStatement(true, 'op');
    this.setColour(HUE.op);
    this.setTooltip(tooltip);
  });
}

function cond(type: string, init: (this: B) => void, tooltip: string) {
  define(type, function () {
    init.call(this);
    this.setOutput(true, 'Boolean');
    this.setInputsInline(true);
    this.setColour(HUE.cond);
    this.setTooltip(tooltip);
  });
}

/** 조건/잠김 문구는 판정·실행 블록 공통 */
function branchHead(b: B, title: string) {
  b.appendValueInput('COND').setCheck('Boolean').appendField(title).appendField('조건');
  b.appendDummyInput().appendField('조건이 거짓일 때 문구').appendField(text(), 'LOCKED');
}

let registered = false;

export function registerScenarioBlocks() {
  if (registered) return;
  registered = true;

  // ── 최상위 블록 ──
  define('wtg_scene', function () {
    this.appendDummyInput().appendField('🏠 장면').appendField(id('new_scene'), 'ID').appendField('시작 장면').appendField(check(), 'START');
    this.appendDummyInput().appendField('이름').appendField(text('새 장면'), 'NAME');
    this.appendDummyInput().appendField('묘사').appendField(text('어떤 곳인가요?'), 'DESC');
    this.appendStatementInput('NPCS').setCheck('npc_ref').appendField('여기 있는 NPC');
    this.appendStatementInput('ON_ENTER').setCheck('op').appendField('들어오면');
    this.appendStatementInput('OBJECTS').setCheck('object').appendField('오브젝트');
    this.appendStatementInput('EXITS').setCheck('exit').appendField('출구');
    this.setColour(HUE.scene);
    this.setTooltip('장면. 플레이어가 머무는 장소입니다. 시작 장면은 하나만 체크하세요.');
  });

  define('wtg_item', function () {
    this.appendDummyInput().appendField('🎒 아이템').appendField(id('new_item'), 'ID').appendField('소모품').appendField(check(), 'CONSUMABLE');
    this.appendDummyInput().appendField('이름').appendField(text('새 아이템'), 'NAME');
    this.appendDummyInput().appendField('설명').appendField(text(), 'DESC');
    this.appendStatementInput('EFFECTS').setCheck('op').appendField('사용하면');
    this.setColour(HUE.item);
    this.setTooltip('아이템. 소모품이면 사용할 때 사라집니다.');
  });

  define('wtg_npc', function () {
    this.appendDummyInput().appendField('🧑 NPC').appendField(id('new_npc'), 'ID');
    this.appendDummyInput().appendField('이름').appendField(text('이름'), 'NAME');
    this.appendDummyInput().appendField('성격').appendField(text(), 'PERSONALITY');
    this.appendDummyInput().appendField('말투').appendField(text(), 'SPEECH');
    this.appendDummyInput().appendField('첫인사').appendField(text(), 'GREETING');
    this.appendStatementInput('KNOWS').setCheck('text_line').appendField('아는 것');
    this.appendStatementInput('SECRETS').setCheck('text_line').appendField('비밀 (AI가 말하지 않음)');
    this.setColour(HUE.npc);
    this.setTooltip('NPC. 대화는 AI가 성격·말투·아는 것을 바탕으로 만들고, 비밀은 공개 동작 전까지 말하지 않습니다.');
  });

  define('wtg_event_use_item', function () {
    this.appendDummyInput().appendField('⚡ 이벤트').appendField(id('new_event'), 'ID');
    this.appendDummyInput().appendField('아이템').appendField(ref('items'), 'ITEM').appendField('을(를)').appendField(ref('targets'), 'TARGET').appendField('에 사용하면');
    this.appendStatementInput('BODY').setCheck('branch').appendField('실행');
    this.setColour(HUE.event);
    this.setTooltip('아이템을 오브젝트나 출구에 사용했을 때 실행됩니다.');
  });

  define('wtg_event_enter_scene', function () {
    this.appendDummyInput().appendField('⚡ 이벤트').appendField(id('new_event'), 'ID');
    this.appendDummyInput().appendField('장면').appendField(ref('scenes'), 'SCENE').appendField('에 들어올 때마다');
    this.appendStatementInput('BODY').setCheck('branch').appendField('실행');
    this.setColour(HUE.event);
    this.setTooltip('장면에 들어올 때마다 실행됩니다. 한 번만 원하면 조건에 플래그를 쓰세요.');
  });

  define('wtg_event_condition', function () {
    this.appendDummyInput().appendField('⚡ 이벤트').appendField(id('new_event'), 'ID').appendField('조건이 처음 참이 되면 (1회)');
    this.appendStatementInput('BODY').setCheck('branch').appendField('실행');
    this.setColour(HUE.event);
    this.setTooltip('아래 판정/실행 블록의 조건이 참이 되는 순간 한 번 실행됩니다. 조건을 꼭 넣으세요.');
  });

  define('wtg_enemy', function () {
    this.appendDummyInput().appendField('👾 적').appendField(id('new_enemy'), 'ID');
    this.appendDummyInput().appendField('이름').appendField(text('적'), 'NAME');
    this.appendDummyInput().appendField('HP').appendField(text('10'), 'HP').appendField('공격 주사위').appendField(text('1d6'), 'ATTACK');
    this.appendDummyInput()
      .appendField('행동')
      .appendField(
        choice([
          ['아무나 공격', 'attack_random'],
          ['HP 낮은 쪽 공격', 'attack_lowest_hp'],
        ]),
        'DEFAULT',
      )
      .appendField('HP가')
      .appendField(num(0, 0), 'FLEE_BELOW')
      .appendField('미만이면 도망 (0 = 안 함)');
    this.appendStatementInput('ON_DEFEAT').setCheck('op').appendField('처치하면');
    this.setColour(HUE.enemy);
    this.setTooltip('적. HP 에는 숫자나 식(예: 20 + 10 * party_size())을 쓸 수 있습니다.');
  });

  define('wtg_ending', function () {
    this.appendDummyInput().appendField('🏁 엔딩').appendField(id('new_ending'), 'ID');
    this.appendDummyInput().appendField('제목').appendField(text('엔딩'), 'TITLE');
    this.appendDummyInput().appendField('내용').appendField(text(), 'TEXT');
    this.appendValueInput('COND').setCheck('Boolean').appendField('조건');
    this.setColour(HUE.ending);
    this.setTooltip('조건이 참이 되면 게임이 끝납니다. 작업 공간에서 위쪽에 놓인 엔딩이 먼저 검사됩니다.');
  });

  // ── 장면 안쪽 ──
  define('wtg_npc_ref', function () {
    this.appendDummyInput().appendField('NPC').appendField(ref('npcs'), 'NPC');
    this.setPreviousStatement(true, 'npc_ref');
    this.setNextStatement(true, 'npc_ref');
    this.setColour(HUE.npc);
  });

  define('wtg_text_line', function () {
    this.appendDummyInput().appendField('•').appendField(text(), 'TEXT');
    this.setPreviousStatement(true, 'text_line');
    this.setNextStatement(true, 'text_line');
    this.setColour(HUE.npc);
  });

  define('wtg_object', function () {
    this.appendDummyInput().appendField('🔎 오브젝트').appendField(id('new_object'), 'ID').appendField('이름').appendField(text('물건'), 'NAME');
    this.appendStatementInput('EXAMINE').setCheck('branch').appendField('살펴보면');
    this.appendStatementInput('INTERACT').setCheck('branch').appendField('다루면');
    this.setPreviousStatement(true, 'object');
    this.setNextStatement(true, 'object');
    this.setColour(HUE.object);
    this.setTooltip('살펴보기는 관찰, 다루기는 직접 행동(열기, 뽑기, 해킹 등)입니다. 필요 없는 쪽은 비워 두세요.');
  });

  define('wtg_exit', function () {
    this.appendDummyInput().appendField('🚪 출구 →').appendField(ref('scenes'), 'TO').appendField('표시').appendField(text('어디로'), 'LABEL');
    this.appendValueInput('COND').setCheck('Boolean').appendField('열리는 조건');
    this.appendDummyInput().appendField('잠겼을 때 문구').appendField(text(), 'LOCKED');
    this.setPreviousStatement(true, 'exit');
    this.setNextStatement(true, 'exit');
    this.setColour(HUE.exit);
  });

  // ── 판정/실행 ──
  define('wtg_branch_actions', function () {
    branchHead(this, '▶ 바로 실행');
    this.appendStatementInput('DO').setCheck('op').appendField('실행');
    this.setPreviousStatement(true, 'branch');
    this.setColour(HUE.branch);
    this.setTooltip('판정 없이 실행합니다.');
  });

  define('wtg_branch_check', function () {
    branchHead(this, '🎲 판정');
    this.appendDummyInput().appendField('스탯').appendField(ref('stats'), 'STAT').appendField('목표값').appendField(num(10, 1), 'DC');
    this.appendStatementInput('SUCCESS').setCheck('op').appendField('성공');
    this.appendStatementInput('FAILURE').setCheck('op').appendField('실패');
    this.appendStatementInput('CRIT_SUCCESS').setCheck('op').appendField('대성공 (비우면 성공)');
    this.appendStatementInput('CRIT_FAILURE').setCheck('op').appendField('대실패 (비우면 실패)');
    this.setPreviousStatement(true, 'branch');
    this.setColour(HUE.branch);
    this.setTooltip('d20 + 스탯이 목표값 이상이면 성공. 대성공/대실패는 주사위 눈으로 정해집니다.');
  });

  // ── 동작 ──
  op('wtg_op_give_item', function () {
    this.appendDummyInput().appendField('아이템 주기').appendField(ref('items'), 'ITEM').appendField('×').appendField(num(1, 1), 'QTY');
  }, '행동한 캐릭터에게 아이템을 줍니다.');
  op('wtg_op_remove_item', function () {
    this.appendDummyInput().appendField('아이템 빼앗기').appendField(ref('items'), 'ITEM').appendField('×').appendField(num(1, 1), 'QTY');
  }, '아이템을 없앱니다.');
  op('wtg_op_add_resource', function () {
    this.appendDummyInput().appendField('자원 바꾸기').appendField(ref('resources'), 'RES').appendField('+').appendField(text('-1d4'), 'VALUE');
  }, '숫자나 주사위(예: 2, -1d4). 음수면 피해.');
  op('wtg_op_set_resource', function () {
    this.appendDummyInput().appendField('자원 정하기').appendField(ref('resources'), 'RES').appendField('=').appendField(text('10'), 'VALUE');
  }, '자원을 정한 값으로 바꿉니다.');
  op('wtg_op_add_stat', function () {
    this.appendDummyInput().appendField('스탯 바꾸기').appendField(ref('stats'), 'STAT').appendField('+').appendField(num(1), 'VALUE');
  }, '스탯을 올리거나 내립니다. 최대 HP 처럼 연결된 값도 함께 바뀝니다.');
  op('wtg_op_set_flag', function () {
    this.appendDummyInput()
      .appendField('플래그')
      .appendField(id('flag_name'), 'FLAG')
      .appendField(
        choice([
          ['켜기', 'TRUE'],
          ['끄기', 'FALSE'],
        ]),
        'VALUE',
      );
  }, '플래그는 따로 만들지 않아도 됩니다. 이름만 쓰면 됩니다.');
  op('wtg_op_add_var', function () {
    this.appendDummyInput().appendField('변수').appendField(ref('vars'), 'VAR').appendField('+').appendField(num(1), 'VALUE');
  }, '변수는 기본 정보의 "변수"에서 먼저 만드세요.');
  op('wtg_op_move_party', function () {
    this.appendDummyInput().appendField('일행 이동 →').appendField(ref('scenes'), 'SCENE');
  }, '장면을 옮깁니다.');
  op('wtg_op_start_combat', function () {
    this.appendDummyInput().appendField('⚔ 전투 시작').appendField(ref('enemies'), 'ENEMY').appendField('×').appendField(num(1, 1), 'COUNT');
  }, '여러 종류의 적이면 이 블록을 이어 붙이세요.');
  op('wtg_op_end_combat', function () {
    this.appendDummyInput().appendField('전투 끝내기');
  }, '전투를 끝냅니다.');
  op('wtg_op_apply_status', function () {
    this.appendDummyInput()
      .appendField('상태이상 걸기')
      .appendField(ref('statuses'), 'STATUS')
      .appendField('저항 스탯')
      .appendField(ref('stats'), 'SAVE_STAT')
      .appendField('목표값')
      .appendField(num(0, 0), 'SAVE_DC');
  }, '저항 스탯을 (선택)으로 두면 저항 없이 걸립니다.');
  op('wtg_op_remove_status', function () {
    this.appendDummyInput().appendField('상태이상 풀기').appendField(ref('statuses'), 'STATUS');
  }, '상태이상을 풉니다.');
  op('wtg_op_narrate_hint', function () {
    this.appendDummyInput().appendField('📝 사실 알리기').appendField(text('무슨 일이 일어났나요?'), 'TEXT');
  }, 'AI 가 이 사실을 바탕으로 서술합니다.');
  op('wtg_op_fixed_text', function () {
    this.appendDummyInput().appendField('💬 그대로 출력').appendField(text('대사'), 'TEXT');
  }, '문장을 고치지 않고 그대로 보여줍니다.');
  op('wtg_op_reveal_secret', function () {
    this.appendDummyInput().appendField('비밀 공개').appendField(npcForSecret(), 'NPC').appendField(new SecretDropdown() as unknown as Blockly.FieldDropdown, 'SECRET');
  }, 'NPC 를 고른 뒤, 그 NPC 블록의 "비밀" 에 적은 문장 중 하나를 고르세요. 공개된 비밀은 AI 가 서술에 쓸 수 있습니다.');
  op('wtg_op_trigger_ending', function () {
    this.appendDummyInput().appendField('🏁 바로 엔딩').appendField(ref('endings'), 'ENDING');
  }, '즉시 엔딩으로 끝냅니다.');
  op('wtg_op_raw', function () {
    this.appendDummyInput().appendField('⚙ 코드로 정의된 동작');
  }, '블록으로 표현하지 못하는 동작입니다. 코드 탭에서 편집하세요.');

  // ── 조건 ──
  cond('wtg_cond_flag', function () {
    this.appendDummyInput()
      .appendField('플래그')
      .appendField(id('flag_name'), 'FLAG')
      .appendField(
        choice([
          ['켜짐', 'ON'],
          ['꺼짐', 'OFF'],
        ]),
        'STATE',
      );
  }, '플래그가 켜져/꺼져 있는지');
  cond('wtg_cond_var', function () {
    this.appendDummyInput().appendField('변수').appendField(ref('vars'), 'VAR').appendField(choice(CMP_OPTIONS), 'OP').appendField(new Blockly.FieldNumber(1), 'NUM');
  }, '변수 비교');
  cond('wtg_cond_stat', function () {
    this.appendDummyInput().appendField('스탯').appendField(ref('stats'), 'STAT').appendField(choice(CMP_OPTIONS), 'OP').appendField(new Blockly.FieldNumber(3), 'NUM');
  }, '행동하는 캐릭터의 스탯 비교');
  cond('wtg_cond_turn', function () {
    this.appendDummyInput().appendField('경과 턴').appendField(choice(CMP_OPTIONS), 'OP').appendField(new Blockly.FieldNumber(100), 'NUM');
  }, '세션 전체 경과 턴');
  cond('wtg_cond_has_item', function () {
    this.appendDummyInput().appendField('아이템').appendField(ref('items'), 'ITEM').appendField('가지고 있음');
  }, '파티 중 누군가 가지고 있는지');
  cond('wtg_cond_in_scene', function () {
    this.appendDummyInput().appendField('지금 장면이').appendField(ref('scenes'), 'SCENE');
  }, '일행이 이 장면에 있는지');
  cond('wtg_cond_all_down', function () {
    this.appendDummyInput().appendField('모두 쓰러짐');
  }, '파티 전원이 쓰러졌는지');
  cond('wtg_cond_and', function () {
    this.appendValueInput('A').setCheck('Boolean');
    this.appendValueInput('B').setCheck('Boolean').appendField('그리고');
  }, '둘 다 참');
  cond('wtg_cond_or', function () {
    this.appendValueInput('A').setCheck('Boolean');
    this.appendValueInput('B').setCheck('Boolean').appendField('또는');
  }, '하나라도 참');
  cond('wtg_cond_not', function () {
    this.appendValueInput('A').setCheck('Boolean').appendField('아님');
  }, '참/거짓 뒤집기');
  cond('wtg_cond_raw', function () {
    this.appendDummyInput().appendField('조건식').appendField(text("flag('x')"), 'EXPR');
  }, '조건식을 직접 씁니다 (기능명세서 §6.6).');
}

const blocks = (...types: string[]) => types.map((type) => ({ kind: 'block', type }));

export const TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: '장면', colour: String(HUE.scene), contents: blocks('wtg_scene', 'wtg_object', 'wtg_exit', 'wtg_npc_ref') },
    { kind: 'category', name: '판정·실행', colour: String(HUE.branch), contents: blocks('wtg_branch_check', 'wtg_branch_actions') },
    {
      kind: 'category',
      name: '동작',
      colour: String(HUE.op),
      contents: blocks(
        'wtg_op_narrate_hint',
        'wtg_op_fixed_text',
        'wtg_op_give_item',
        'wtg_op_remove_item',
        'wtg_op_add_resource',
        'wtg_op_set_resource',
        'wtg_op_add_stat',
        'wtg_op_set_flag',
        'wtg_op_add_var',
        'wtg_op_move_party',
        'wtg_op_start_combat',
        'wtg_op_end_combat',
        'wtg_op_apply_status',
        'wtg_op_remove_status',
        'wtg_op_reveal_secret',
        'wtg_op_trigger_ending',
      ),
    },
    {
      kind: 'category',
      name: '조건',
      colour: String(HUE.cond),
      contents: blocks(
        'wtg_cond_flag',
        'wtg_cond_has_item',
        'wtg_cond_var',
        'wtg_cond_stat',
        'wtg_cond_in_scene',
        'wtg_cond_turn',
        'wtg_cond_all_down',
        'wtg_cond_and',
        'wtg_cond_or',
        'wtg_cond_not',
        'wtg_cond_raw',
      ),
    },
    { kind: 'category', name: '아이템', colour: String(HUE.item), contents: blocks('wtg_item') },
    { kind: 'category', name: 'NPC', colour: String(HUE.npc), contents: blocks('wtg_npc', 'wtg_text_line') },
    { kind: 'category', name: '이벤트', colour: String(HUE.event), contents: blocks('wtg_event_use_item', 'wtg_event_enter_scene', 'wtg_event_condition') },
    { kind: 'category', name: '적', colour: String(HUE.enemy), contents: blocks('wtg_enemy') },
    { kind: 'category', name: '엔딩', colour: String(HUE.ending), contents: blocks('wtg_ending') },
  ],
};
