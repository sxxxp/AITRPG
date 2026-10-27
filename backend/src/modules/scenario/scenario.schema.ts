import { z } from 'zod';

// 시나리오 파일 포맷 v1 — docs/기능명세서.md §6
// 구조(형식)만 검사한다. 참조 무결성은 scenario.validator.ts 에서 검사.

export const ID_RE = /^[a-z][a-z0-9_]*$/;
export const DICE_RE = /^-?\d+(d\d+)?([+-]\d+)?$/;
export const BEHAVIOR_ACTION_RE = /^(attack_random|attack_lowest_hp|flee|skill:[a-z][a-z0-9_]*)$/;
export const TARGET_RE = /^([a-z][a-z0-9_]*)\.(objects|exits)\.([a-z][a-z0-9_]*)$/;

const id = z.string().regex(ID_RE, 'ID는 영문 소문자로 시작하는 snake_case여야 합니다');
const text = z.string().min(1, '비어 있을 수 없습니다');
const expr = text; // 조건식 DSL (§6.5)
const int = z.number().int();
const dice = z.string().regex(DICE_RE, '주사위 표기여야 합니다 (예: 1d20, 2d6+1)');
const amount = z.union([int, z.string().regex(DICE_RE, '정수 또는 주사위 표기여야 합니다 (예: 3, -1, 1d6+1, -1d4)')]);
const numOrExpr = z.union([z.number(), text]);
const idMap = <T extends z.ZodTypeAny>(value: T) => z.record(id, value);

export const checkSchema = z
  .object({
    stat: text,
    dc: int.min(1),
    modifiers: z.array(z.object({ when: expr, bonus: int }).strict()).optional(),
  })
  .strict();

const saveSchema = z.object({ stat: text, dc: int.min(1) }).strict();

const op = <N extends string, S extends z.ZodRawShape>(name: N, shape: S) =>
  z.object({ op: z.literal(name), ...shape }).strict();

export const opSchema = z.discriminatedUnion('op', [
  op('give_item', { item: id, quantity: int.min(1).optional() }),
  op('remove_item', { item: id, quantity: int.min(1).optional() }),
  op('add_resource', { resource: id, value: amount }),
  op('set_resource', { resource: id, value: amount }),
  op('add_stat', { stat: text, value: int }),
  op('set_flag', { flag: id, value: z.boolean() }),
  op('add_var', { var: id, value: int }),
  op('move_party', { scene: id }),
  op('start_combat', { enemies: z.array(id).min(1) }),
  op('end_combat', {}),
  op('apply_status', { status: id, save: saveSchema.optional() }),
  op('remove_status', { status: id }),
  op('narrate_hint', { text }),
  op('fixed_text', { text }),
  op('reveal_secret', { npc: id, secret: text }),
  op('trigger_ending', { ending: id }),
]);

export const OP_NAMES = opSchema.options.map((o) => o.shape.op.value);

const ops = z.array(opSchema);

/**
 * 판정 없는 actions, 또는 check + success + failure.
 * critical_success / critical_failure 는 선택: 주사위가 ruleset.critical 값이면 success / failure 대신 실행
 */
const branchShape = {
  condition: expr.optional(),
  locked_text: text.optional(),
  actions: ops.optional(),
  check: checkSchema.optional(),
  success: ops.optional(),
  failure: ops.optional(),
  critical_success: ops.optional(),
  critical_failure: ops.optional(),
};

type Branch = {
  actions?: unknown;
  check?: unknown;
  success?: unknown;
  failure?: unknown;
  critical_success?: unknown;
  critical_failure?: unknown;
};

function refineBranch(v: Branch, ctx: z.RefinementCtx) {
  if (v.check === undefined) {
    for (const key of ['critical_success', 'critical_failure'] as const) {
      if (v[key] !== undefined) ctx.addIssue({ code: 'custom', path: [key], message: `${key} 는 check 와 함께 써야 합니다` });
    }
  }
  if (v.check !== undefined) {
    if (v.success === undefined) ctx.addIssue({ code: 'custom', path: ['success'], message: 'check 가 있으면 success 가 필요합니다' });
    if (v.failure === undefined) ctx.addIssue({ code: 'custom', path: ['failure'], message: 'check 가 있으면 failure 가 필요합니다' });
    if (v.actions !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['actions'], message: 'check 와 actions 는 함께 쓸 수 없습니다 (success/failure 사용)' });
    }
  } else {
    if (v.actions === undefined) ctx.addIssue({ code: 'custom', path: [], message: 'actions 또는 check/success/failure 가 필요합니다' });
    if (v.success !== undefined || v.failure !== undefined) {
      ctx.addIssue({ code: 'custom', path: [], message: 'success/failure 는 check 와 함께 써야 합니다' });
    }
  }
}

export const interactionSchema = z.object(branchShape).strict().superRefine(refineBranch);

const triggerSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('use_item'),
      item: id,
      target: z.string().regex(TARGET_RE, '대상은 <장면>.objects.<오브젝트> 또는 <장면>.exits.<출구 장면> 형식입니다').optional(),
    })
    .strict(),
  z.object({ type: z.literal('enter_scene'), scene: id }).strict(),
  z.object({ type: z.literal('condition') }).strict(),
]);

export const eventSchema = z
  .object({ id, trigger: triggerSchema, ...branchShape })
  .strict()
  .superRefine((v, ctx) => {
    refineBranch(v, ctx);
    if (v.trigger.type === 'condition' && v.condition === undefined) {
      ctx.addIssue({ code: 'custom', path: ['condition'], message: "trigger.type 이 condition 이면 condition 이 필요합니다" });
    }
  });

const exitSchema = z
  .object({ to: id, label: text, condition: expr.optional(), locked_text: text.optional() })
  .strict();

const sceneSchema = z
  .object({
    name: text,
    description: text,
    npcs: z.array(id).optional(),
    on_enter: ops.optional(),
    objects: idMap(
      z.object({ name: text, on_examine: interactionSchema.optional(), on_interact: interactionSchema.optional() }).strict(),
    ).optional(),
    exits: z.array(exitSchema),
  })
  .strict();

const attackSchema = z.object({ dice, targets: z.enum(['single', 'all']).optional() }).strict();
const behaviorAction = z
  .string()
  .regex(BEHAVIOR_ACTION_RE, 'attack_random | attack_lowest_hp | flee | skill:<스킬 ID> 중 하나여야 합니다');

const enemySchema = z
  .object({
    name: text,
    hp: z.union([int.min(1), text]),
    attack: attackSchema,
    skills: idMap(
      z
        .object({ name: text, attack: attackSchema.optional(), effects: ops.optional() })
        .strict()
        .refine((s) => s.attack || s.effects, 'attack 또는 effects 가 필요합니다'),
    ).optional(),
    behavior: z
      .array(
        z.union([
          z.object({ when: expr, do: behaviorAction }).strict(),
          z.object({ default: behaviorAction }).strict(),
        ]),
      )
      .min(1),
    on_defeat: ops.optional(),
  })
  .strict();

const metaSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, '시나리오 ID는 영문 소문자 kebab-case여야 합니다'),
    title: text,
    author: text,
    summary: text.optional(),
    players: z
      .object({ min: int.min(1), max: int.min(1) })
      .strict()
      .refine((p) => p.min <= p.max, '최소 인원이 최대 인원보다 클 수 없습니다'),
    estimated_minutes: int.min(1),
    rating: z.enum(['전체', '12세', '15세', '18세']),
    tags: z.array(text),
    language: text,
    start_scene: id,
  })
  .strict();

const rulesetSchema = z
  .object({
    stats: z.array(text).min(1),
    resources: idMap(z.object({ max: numOrExpr, min: numOrExpr }).strict()),
    check: z.object({ dice, formula: text }).strict(),
    critical: z.object({ success: int, failure: int }).strict().optional(),
    character_creation: z
      .object({
        method: z.literal('point_buy'),
        total_points: int.min(1),
        min_per_stat: int,
        max_per_stat: int,
        allow_custom: z.boolean(),
      })
      .strict()
      .optional(),
    combat: z
      .object({
        attack_stat: text,
        attack_dc: int.min(1),
        damage: dice,
        damage_bonus_stat: text.optional(),
        dodge: saveSchema.optional(),
        flee: saveSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

export const scenarioSchema = z
  .object({
    format_version: z.literal(1),
    meta: metaSchema,
    ruleset: rulesetSchema,
    presets: idMap(z.object({ name: text, description: text, stats: z.record(z.string(), int) }).strict()).optional(),
    variables: idMap(int).optional(),
    statuses: idMap(
      z
        .object({
          name: text,
          description: text.optional(),
          duration: z.union([int.min(1), z.literal('until_removed')]),
          restrict_actions: z.boolean().optional(),
          on_turn_start: ops.optional(),
          resist: z.object({ check: checkSchema, on_success: ops }).strict().optional(),
        })
        .strict(),
    ).optional(),
    ai_guide: z
      .object({
        tone: text,
        narration_length: z.enum(['short', 'medium', 'long']),
        world_lore: text,
        style_rules: z.array(text).optional(),
        glossary: z.record(z.string(), text).optional(),
      })
      .strict(),
    items: idMap(
      z.object({ name: text, description: text.optional(), consumable: z.boolean(), effects: ops }).strict(),
    ),
    npcs: idMap(
      z
        .object({
          name: text,
          personality: text,
          speech_style: text.optional(),
          knows: z.array(text),
          secrets: z.array(text),
          fixed_lines: z.record(z.string(), text).optional(),
        })
        .strict(),
    ),
    scenes: idMap(sceneSchema),
    events: z.array(eventSchema).optional(),
    enemies: idMap(enemySchema).optional(),
    endings: z.array(z.object({ id, title: text, condition: expr, text }).strict()).min(1),
  })
  .strict();

export type Scenario = z.infer<typeof scenarioSchema>;
export type Op = z.infer<typeof opSchema>;
export type Check = z.infer<typeof checkSchema>;
export type Interaction = z.infer<typeof interactionSchema>;
export type ScenarioEvent = z.infer<typeof eventSchema>;
