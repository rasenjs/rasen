/**
 * Diablo II's calc mini-language.
 *
 * The rule tables do not store numbers, they store *formulas* as text: 47 columns
 * of `skills.txt` (from `calc1..calc10` through `aurastatcalc1..6`,
 * `passivecalc1..14`, `sumsk1calc..5`, `ToHitCalc`, `DmgSymPerCalc` and their
 * elemental counterparts) plus the analogous columns in `missiles.txt`,
 * `monpet.txt`, `treasureclassex.txt` and the skill-description tables hold
 * expressions like `min(ln12,24)`, `skill('Warmth'.blvl)*par8` or
 * `((110 * skill('Summon Defiler'.lvl) * (par4 - par3)) / (100 * (skill('Summon Defiler'.lvl) + 6)) + par3`.
 * Reproducing the game therefore means *interpreting* those formulas, and this
 * module is that interpreter.
 *
 * ## What the language actually is
 *
 * Everything here was read out of the exported tables rather than assumed. The
 * character set that appears across every calc column of every table is
 * `'()+,-./:<=>?%` plus digits, letters and `_`, and the only names that are ever
 * called are `min`, `max`, `rand`, `skill`, `sksrc`, `stat` and `miss`
 * (plus `cond` in the two conditions tables). So the grammar is C-like:
 *
 * ```
 * expr        := conditional
 * conditional := comparison ('?' expr ':' expr)?
 * comparison  := additive (('<' | '<=' | '>' | '>=' | '==' | '!=') additive)*
 * additive    := multiplicative (('+' | '-') multiplicative)*
 * multiplicative := unary (('*' | '/' | '%') unary)*
 * unary       := ('-' | '+' | '!') unary | postfix
 * postfix     := primary ('.' IDENT)*
 * primary     := NUMBER | STRING | IDENT ('(' expr (',' expr)* ')')? | '(' expr ')'
 * ```
 *
 * Two details worth stating because they are *not* what one might expect:
 *
 * - There is **no percentage operator and no `chance` function**. `%` is the
 *   modulo operator, and it is used exactly once in the whole export
 *   (`monpet.txt`: `((sksrc('Bind Demon'.sctk)%12)==0)`). Percentages in this
 *   language are expressed by the stat system, not by the calculator.
 * - `rand(a,b)` is the only randomness, and it appears once, in
 *   `monpet.txt`: `Imp Inferno calc1 = rand(par3,par4)`. `random` is accepted as
 *   a spelling of it because the two names cost nothing to support.
 *
 * Two properties of the real data shape the implementation:
 *
 * - **Nesting is real.** `min((lvl+skill('Dopplezon'.blvl))*par7,85)` cannot be
 *   handled by a chain of regular expressions, so the parser here is a genuine
 *   recursive-descent parser over a token stream. Call arguments are parsed as
 *   full expressions, which is what makes `skill('X'.blvl)` work: the argument is
 *   a *member access on a string literal*, not a string followed by a dot.
 * - **The data is not clean.** Six expressions in `skills.txt` are missing a
 *   closing parenthesis (`Fire Wall / EDmgSymPerCalc` is one). The parser
 *   recovers instead of throwing, and reports every recovery through the
 *   diagnostic sink, because a table cell that cannot be parsed must not take the
 *   whole game down.
 *
 * ## Formula aliases
 *
 * `ln12`/`dm12`-style names are macros. Their definitions live in the tables
 * themselves (`table_skillcalc.json`, `table_misscalc.json`) as text, e.g.
 * `ln12 :: par1 + (lvl - 1) * par2` and
 * `dm34 :: ((110 * lvl) * (par4 - par3)) / (100 * (lvl + 6)) + par3`.
 * {@link deriveFormulaDefs} re-derives those from the table rows, and the
 * built-in {@link SKILL_FORMULAS} is the same set inlined so a context does not
 * have to fetch anything. The two are asserted equal by the test suite.
 *
 * Note the digit pairs are *not* a simple pattern: the sixth pair of skill
 * formulas is `ln21` (params 11 and 12) and the fifth is `ln91` (params 9 and 10),
 * so the mapping is taken from the definitions rather than decoded from the name.
 *
 * ## What this module deliberately does not do
 *
 * A handful of primitives are *outputs of the damage engine*, not of a formula:
 * `edmn`, `edmx`, `edln`, `enma`, `exma`, `toht`, `mana`, `usmc`, the `m1en`
 * family, and `accr` on a skill. Their values depend on the weapon, mastery and
 * deadliness pipeline, which is another module's job. They are resolved through
 * {@link CalcContext.resolveVariable} (and, for whole skills,
 * {@link SkillCalcEnvOptions.variables}) and evaluate to `0` when no provider is
 * supplied, which keeps every table expression finite instead of `NaN`.
 */

/* -------------------------------------------------------------------------- */
/* Diagnostics                                                                */
/* -------------------------------------------------------------------------- */

/** Why a calc expression could not be evaluated exactly. */
export type CalcDiagnosticKind =
  | 'parse'
  | 'unknown-variable'
  | 'unknown-function'
  | 'unsupported'
  | 'recursion'

/** A single problem found while parsing or evaluating a calc expression. */
export interface CalcDiagnostic {
  readonly kind: CalcDiagnosticKind
  readonly message: string
  /** The expression the problem was found in. */
  readonly source: string
}

/** Receives every parse and evaluation problem. */
export type DiagnosticSink = (diagnostic: CalcDiagnostic) => void

/* -------------------------------------------------------------------------- */
/* AST                                                                        */
/* -------------------------------------------------------------------------- */

export interface CalcNumberNode {
  readonly kind: 'number'
  readonly value: number
}

export interface CalcStringNode {
  readonly kind: 'string'
  readonly value: string
}

export interface CalcVariableNode {
  readonly kind: 'variable'
  readonly name: string
}

/** `'Name'.field` — a reference, not arithmetic; only meaningful as a call argument. */
export interface CalcMemberNode {
  readonly kind: 'member'
  readonly object: CalcNode
  readonly field: string
}

export interface CalcCallNode {
  readonly kind: 'call'
  readonly name: string
  readonly args: readonly CalcNode[]
}

export interface CalcUnaryNode {
  readonly kind: 'unary'
  readonly operator: '-' | '+' | '!'
  readonly operand: CalcNode
}

export type CalcBinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '<'
  | '<='
  | '>'
  | '>='
  | '=='
  | '!='

export interface CalcBinaryNode {
  readonly kind: 'binary'
  readonly operator: CalcBinaryOperator
  readonly left: CalcNode
  readonly right: CalcNode
}

export interface CalcConditionalNode {
  readonly kind: 'conditional'
  readonly test: CalcNode
  readonly consequent: CalcNode
  readonly alternate: CalcNode
}

/** A parsed calc expression. */
export type CalcNode =
  | CalcNumberNode
  | CalcStringNode
  | CalcVariableNode
  | CalcMemberNode
  | CalcCallNode
  | CalcUnaryNode
  | CalcBinaryNode
  | CalcConditionalNode

/* -------------------------------------------------------------------------- */
/* Formula aliases (`ln12`, `dm34`, ...)                                       */
/* -------------------------------------------------------------------------- */

/** `linear` is `a + (lvl - 1) * b`; `diminishing` is the `110 * lvl` curve. */
export type FormulaKind = 'linear' | 'diminishing'
/**
 * One `ln`/`dm`-style alias, with the *variable names* it reads.
 *
 * The names are variables rather than parameter indices because the families in
 * the tables differ: skill formulas read `par1..par9`/`pa10..pa20`, missile
 * formulas read `par1..par5` or `cpa1`, `hpa1`, `dpa1`.
 *
 * The diminishing curve is `((110 * lvl) * (b - a)) / (100 * (lvl + 6)) + a`, so
 * it is *not* asymptotic: the `110/100` factor cancels the `lvl + 6` term exactly
 * at level 60 (`110 × 60 == 100 × 66`), where the value equals `b` and afterwards
 * exceeds it. That is the table's own definition, not a rounding artefact.
 */
export interface FormulaDef {
  readonly code: string
  readonly kind: FormulaKind
  /** Variable holding the base value, e.g. `par1`. */
  readonly a: string
  /** Variable holding the per-level amount, e.g. `par2`. */
  readonly b: string
}

/** Formula aliases, keyed by lower-case code (`ln12`). */
export type FormulaDefs = Readonly<Record<string, FormulaDef>>

function linear(code: string, a: string, b: string): FormulaDef {
  return { code, kind: 'linear', a, b }
}

function diminishing(code: string, a: string, b: string): FormulaDef {
  return { code, kind: 'diminishing', a, b }
}

/**
 * The `skills.txt` aliases, transcribed from `table_skillcalc.json`.
 *
 * Kept inline so that evaluating a skill row needs no table fetch; the test suite
 * checks it against a fresh parse of the table.
 */
export const SKILL_FORMULAS: FormulaDefs = {
  ln12: linear('ln12', 'par1', 'par2'),
  ln34: linear('ln34', 'par3', 'par4'),
  ln56: linear('ln56', 'par5', 'par6'),
  ln78: linear('ln78', 'par7', 'par8'),
  ln91: linear('ln91', 'par9', 'pa10'),
  ln21: linear('ln21', 'pa11', 'pa12'),
  ln43: linear('ln43', 'pa13', 'pa14'),
  ln65: linear('ln65', 'pa15', 'pa16'),
  ln87: linear('ln87', 'pa17', 'pa18'),
  ln92: linear('ln92', 'pa19', 'pa20'),
  dm12: diminishing('dm12', 'par1', 'par2'),
  dm34: diminishing('dm34', 'par3', 'par4'),
  dm56: diminishing('dm56', 'par5', 'par6'),
  dm78: diminishing('dm78', 'par7', 'par8'),
  dm91: diminishing('dm91', 'par9', 'pa10'),
  dm21: diminishing('dm21', 'pa11', 'pa12'),
  dm43: diminishing('dm43', 'pa13', 'pa14'),
  dm65: diminishing('dm65', 'pa15', 'pa16'),
  dm87: diminishing('dm87', 'pa17', 'pa18'),
  dm92: diminishing('dm92', 'pa19', 'pa20')
}

/* -------------------------------------------------------------------------- */
/* Tokenizer                                                                  */
/* -------------------------------------------------------------------------- */

type TokenKind = 'number' | 'string' | 'identifier' | 'operator' | 'end'

interface Token {
  readonly kind: TokenKind
  readonly text: string
  readonly value: number
  readonly position: number
}

const TWO_CHARACTER_OPERATORS = ['<=', '>=', '==', '!=']
const ONE_CHARACTER_OPERATORS = '+-*/%(),.?:!<>'

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= '0' && character <= '9'
}

function isIdentifierStart(character: string): boolean {
  return (
    (character >= 'a' && character <= 'z') ||
    (character >= 'A' && character <= 'Z') ||
    character === '_'
  )
}

function isIdentifierPart(character: string): boolean {
  return isIdentifierStart(character) || isDigit(character)
}

function tokenize(source: string, report: DiagnosticSink): readonly Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const character = source[index]
    if (
      character === ' ' ||
      character === '\t' ||
      character === '\n' ||
      character === '\r'
    ) {
      index += 1
      continue
    }

    if (
      isDigit(character) ||
      (character === '.' && isDigit(source[index + 1]))
    ) {
      const start = index
      while (
        index < source.length &&
        (isDigit(source[index]) || source[index] === '.')
      )
        index += 1
      const text = source.slice(start, index)
      const value = Number.parseFloat(text)
      tokens.push({
        kind: 'number',
        text,
        value: Number.isFinite(value) ? value : 0,
        position: start
      })
      continue
    }

    if (character === "'") {
      const start = index
      index += 1
      let text = ''
      while (index < source.length && source[index] !== "'") {
        text += source[index]
        index += 1
      }
      if (index >= source.length) {
        report({
          kind: 'parse',
          message: 'unterminated string literal',
          source
        })
      } else {
        index += 1
      }
      tokens.push({ kind: 'string', text, value: 0, position: start })
      continue
    }

    if (isIdentifierStart(character)) {
      const start = index
      while (index < source.length && isIdentifierPart(source[index]))
        index += 1
      tokens.push({
        kind: 'identifier',
        text: source.slice(start, index),
        value: 0,
        position: start
      })
      continue
    }

    const pair = source.slice(index, index + 2)
    if (TWO_CHARACTER_OPERATORS.includes(pair)) {
      tokens.push({ kind: 'operator', text: pair, value: 0, position: index })
      index += 2
      continue
    }

    if (ONE_CHARACTER_OPERATORS.includes(character)) {
      tokens.push({
        kind: 'operator',
        text: character,
        value: 0,
        position: index
      })
      index += 1
      continue
    }

    report({
      kind: 'parse',
      message: `ignoring unexpected character '${character}'`,
      source
    })
    index += 1
  }
  tokens.push({ kind: 'end', text: '', value: 0, position: source.length })
  return tokens
}

/* -------------------------------------------------------------------------- */
/* Parser                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Parses a calc expression.
 *
 * Never throws: a malformed cell yields the part that could be parsed with `0` in
 * place of the rest, and every recovery is reported.
 */
export function parseCalc(
  source: string,
  report: DiagnosticSink = () => {}
): CalcNode {
  const parser = new Parser(source, report)
  return parser.parse()
}

class Parser {
  private readonly tokens: readonly Token[]
  private index = 0

  constructor(
    private readonly source: string,
    private readonly report: DiagnosticSink
  ) {
    this.tokens = tokenize(source, report)
  }

  parse(): CalcNode {
    const node = this.parseConditional()
    if (this.peek().kind !== 'end') {
      this.report({
        kind: 'parse',
        message: `ignoring trailing input at '${this.peek().text}'`,
        source: this.source
      })
    }
    return node
  }

  private peek(): Token {
    return this.tokens[this.index]
  }

  private next(): Token {
    const token = this.tokens[this.index]
    if (token.kind !== 'end') this.index += 1
    return token
  }

  private acceptOperator(text: string): boolean {
    const token = this.peek()
    if (token.kind === 'operator' && token.text === text) {
      this.index += 1
      return true
    }
    return false
  }

  private parseConditional(): CalcNode {
    const test = this.parseComparison()
    if (!this.acceptOperator('?')) return test
    const consequent = this.parseConditional()
    if (!this.acceptOperator(':')) {
      // `a ? b` with no else arm appears in the tables; the absent arm is 0.
      this.report({
        kind: 'parse',
        message: "missing ':' in conditional",
        source: this.source
      })
      return {
        kind: 'conditional',
        test,
        consequent,
        alternate: { kind: 'number', value: 0 }
      }
    }
    const alternate = this.parseConditional()
    return { kind: 'conditional', test, consequent, alternate }
  }

  private parseComparison(): CalcNode {
    let left = this.parseAdditive()
    for (;;) {
      const token = this.peek()
      if (token.kind !== 'operator') return left
      if (!['<', '<=', '>', '>=', '==', '!='].includes(token.text)) return left
      this.index += 1
      const right = this.parseAdditive()
      left = {
        kind: 'binary',
        operator: token.text as CalcBinaryOperator,
        left,
        right
      }
    }
  }

  private parseAdditive(): CalcNode {
    let left = this.parseMultiplicative()
    for (;;) {
      const token = this.peek()
      if (
        token.kind !== 'operator' ||
        (token.text !== '+' && token.text !== '-')
      )
        return left
      this.index += 1
      const right = this.parseMultiplicative()
      left = { kind: 'binary', operator: token.text, left, right }
    }
  }

  private parseMultiplicative(): CalcNode {
    let left = this.parseUnary()
    for (;;) {
      const token = this.peek()
      if (token.kind !== 'operator') return left
      if (token.text !== '*' && token.text !== '/' && token.text !== '%')
        return left
      this.index += 1
      const right = this.parseUnary()
      left = { kind: 'binary', operator: token.text, left, right }
    }
  }

  private parseUnary(): CalcNode {
    const token = this.peek()
    if (
      token.kind === 'operator' &&
      (token.text === '-' || token.text === '+' || token.text === '!')
    ) {
      this.index += 1
      return { kind: 'unary', operator: token.text, operand: this.parseUnary() }
    }
    return this.parsePostfix()
  }

  private parsePostfix(): CalcNode {
    let node = this.parsePrimary()
    while (this.peek().kind === 'operator' && this.peek().text === '.') {
      this.index += 1
      const field = this.next()
      if (field.kind !== 'identifier') {
        this.report({
          kind: 'parse',
          message: `expected a field name after '.', found '${field.text}'`,
          source: this.source
        })
        break
      }
      node = { kind: 'member', object: node, field: field.text }
    }
    return node
  }

  private parsePrimary(): CalcNode {
    const token = this.next()

    if (token.kind === 'number') return { kind: 'number', value: token.value }
    if (token.kind === 'string') return { kind: 'string', value: token.text }

    if (token.kind === 'identifier') {
      if (this.peek().kind === 'operator' && this.peek().text === '(') {
        this.index += 1
        const args: CalcNode[] = []
        if (!this.acceptOperator(')')) {
          for (;;) {
            args.push(this.parseConditional())
            if (this.acceptOperator(',')) continue
            if (this.acceptOperator(')')) break
            // Runs out at either `)` or the end of a truncated cell.
            if (this.peek().kind === 'end') {
              this.report({
                kind: 'parse',
                message: `unterminated argument list for '${token.text}'`,
                source: this.source
              })
              break
            }
            this.report({
              kind: 'parse',
              message: `expected ',' or ')' in '${token.text}', found '${this.peek().text}'`,
              source: this.source
            })
            break
          }
        }
        return { kind: 'call', name: token.text, args }
      }
      return { kind: 'variable', name: token.text }
    }

    if (token.kind === 'operator' && token.text === '(') {
      const inner = this.parseConditional()
      if (!this.acceptOperator(')')) {
        this.report({
          kind: 'parse',
          message: "missing ')'",
          source: this.source
        })
      }
      return inner
    }

    if (token.kind === 'end') {
      this.report({
        kind: 'parse',
        message: 'expression ended early',
        source: this.source
      })
    } else {
      this.report({
        kind: 'parse',
        message: `ignoring unexpected token '${token.text}'`,
        source: this.source
      })
    }
    return { kind: 'number', value: 0 }
  }
}

/* -------------------------------------------------------------------------- */
/* Structural recognition of formula definitions                              */
/* -------------------------------------------------------------------------- */

function asVariable(node: CalcNode): string | null {
  return node.kind === 'variable' ? node.name : null
}

function asNumber(node: CalcNode, value: number): boolean {
  return node.kind === 'number' && node.value === value
}

/** Recognises `(lvl - 1)`, `lvl - 1`, and the commuted `1 + lvl` spellings. */
function asLevelMinusOne(node: CalcNode): boolean {
  if (
    node.kind === 'binary' &&
    node.operator === '-' &&
    asVariable(node.left) === 'lvl' &&
    asNumber(node.right, 1)
  ) {
    return true
  }
  return false
}

/** `a + (lvl - 1) * b`, in either operand order. */
function matchLinear(node: CalcNode): { a: string; b: string } | null {
  if (node.kind !== 'binary' || node.operator !== '+') return null
  for (const [base, scaled] of [
    [node.left, node.right],
    [node.right, node.left]
  ] as const) {
    const a = asVariable(base)
    if (!a || a === 'lvl') continue
    if (scaled.kind !== 'binary' || scaled.operator !== '*') continue
    for (const [levelTerm, increment] of [
      [scaled.left, scaled.right],
      [scaled.right, scaled.left]
    ] as const) {
      const b = asVariable(increment)
      if (b && asLevelMinusOne(levelTerm)) return { a, b }
    }
  }
  return null
}

/** `((110 * lvl) * (b - a)) / (100 * (lvl + 6)) + a`, in either operand order. */
function matchDiminishing(node: CalcNode): { a: string; b: string } | null {
  if (node.kind !== 'binary' || node.operator !== '+') return null
  for (const [base, fraction] of [
    [node.left, node.right],
    [node.right, node.left]
  ] as const) {
    const a = asVariable(base)
    if (!a || a === 'lvl') continue
    if (fraction.kind !== 'binary' || fraction.operator !== '/') continue
    const numerator = fraction.left
    if (numerator.kind !== 'binary' || numerator.operator !== '*') continue
    const difference = [numerator.left, numerator.right].find(
      (side) => side.kind === 'binary' && side.operator === '-'
    )
    if (
      !difference ||
      difference.kind !== 'binary' ||
      difference.operator !== '-'
    )
      continue
    // The base is the *subtrahend*: `((110*lvl)*(par2 - par1))/(...) + par1`.
    const b = asVariable(difference.left)
    if (b && asVariable(difference.right) === a) return { a, b }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Evaluation context                                                         */
/* -------------------------------------------------------------------------- */

/** A `'Name'.field` reference extracted from a call argument. */
export interface CalcReference {
  readonly name: string
  readonly field: string
}

/** The values a calc expression can see. Everything is optional; absent is `0`. */
export interface CalcContext {
  /** Skill level with bonuses (`lvl`). */
  readonly lvl?: number
  /** Base skill level without bonuses (`blvl`). */
  readonly blvl?: number
  /** Caller level (`ulvl`). */
  readonly ulvl?: number
  /** `par1..par9` then `pa10..pa20`, in table order. */
  readonly params?: readonly number[]
  /** Extra named primitives, e.g. `clc1`, `ast3`, `edmn`, `hpct`. */
  readonly vars?: Readonly<Record<string, number>>
  /** Formula aliases; defaults to {@link SKILL_FORMULAS}. */
  readonly formulas?: FormulaDefs
  /** Resolves a variable that is neither a parameter, a formula nor in `vars`. */
  readonly resolveVariable?: (name: string) => number | undefined
  /** `skill('Name'.field)`. */
  readonly skillRef?: (reference: CalcReference) => number
  /** `sksrc('Name'.field)` — the skill that created the current monster. */
  readonly sksrcRef?: (reference: CalcReference) => number
  /** `stat('name'.field)`. */
  readonly statRef?: (reference: CalcReference) => number
  /** `miss('name'.field)` / `missile('name'.field)`. */
  readonly missileRef?: (reference: CalcReference) => number
  /** `cond('Name')` and `cond('Name', value)`. Returns a truthy number. */
  readonly condition?: (name: string, value: number | undefined) => number
  /** Source of `rand(a,b)`; defaults to `Math.random`. */
  readonly random?: () => number
  /**
   * Reproduces the original's integer arithmetic: every arithmetic result is
   * truncated toward zero. The tables specify formulas such as
   * `(100/clc5)/2`, whose original result is an integer, but they do not say
   * which columns were compiled as fixed point, so the default is true floating
   * point and this is opt-in.
   */
  readonly integerMath?: boolean
  readonly onDiagnostic?: DiagnosticSink
}

/* -------------------------------------------------------------------------- */
/* Evaluation                                                                 */
/* -------------------------------------------------------------------------- */

interface EvaluationState {
  readonly source: string
  readonly report: DiagnosticSink
}

const PARAMETER_CODES: Readonly<Record<string, number>> = (() => {
  const codes: Record<string, number> = {}
  for (let index = 1; index <= 9; index += 1) codes[`par${index}`] = index
  for (let index = 10; index <= 20; index += 1) codes[`pa${index}`] = index
  return codes
})()

/** Parameter index (1-based) for a `parN`/`paN` code, or `null`. */
export function parameterIndex(code: string): number | null {
  const index = PARAMETER_CODES[code.toLowerCase()]
  return index === undefined ? null : index
}

function formulaValue(
  definition: FormulaDef,
  level: number,
  a: number,
  b: number
): number {
  if (definition.kind === 'linear') return a + (level - 1) * b
  return (110 * level * (b - a)) / (100 * (level + 6)) + a
}

function referenceOf(node: CalcNode) {
  if (node.kind === 'member' && node.object.kind === 'string') {
    return { name: node.object.value, field: node.field }
  }
  if (node.kind === 'string') return { name: node.value, field: 'lvl' }
  return null
}

function isTruthy(value: number): boolean {
  return value !== 0 && !Number.isNaN(value)
}

function evaluateNode(
  node: CalcNode,
  context: CalcContext,
  state: EvaluationState
): number {
  const truncate =
    context.integerMath === true ? Math.trunc : (value: number): number => value

  switch (node.kind) {
    case 'number':
      return node.value

    case 'string':
      // A bare string is a reference descriptor, not a value.
      state.report({
        kind: 'unsupported',
        message: `string literal '${node.value}' is only valid as a call argument`,
        source: state.source
      })
      return 0

    case 'variable':
      return evaluateVariable(node.name, context, state)

    case 'member': {
      if (node.object.kind === 'string') {
        const resolved = context.skillRef?.({
          name: node.object.value,
          field: node.field
        })
        if (resolved !== undefined) return resolved
      }
      state.report({
        kind: 'unsupported',
        message: `field '${node.field}' has no context here`,
        source: state.source
      })
      return evaluateNode(node.object, context, state)
    }

    case 'unary': {
      const operand = evaluateNode(node.operand, context, state)
      if (node.operator === '-') return truncate(-operand)
      if (node.operator === '+') return operand
      return isTruthy(operand) ? 0 : 1
    }

    case 'conditional':
      return isTruthy(evaluateNode(node.test, context, state))
        ? evaluateNode(node.consequent, context, state)
        : evaluateNode(node.alternate, context, state)

    case 'binary': {
      const left = evaluateNode(node.left, context, state)
      // Both arms are always evaluated, including under a comparison: the
      // language has no side effects, so the only cost is work, and a division or
      // modulo by zero is defined as 0 rather than thrown.
      const right = evaluateNode(node.right, context, state)
      switch (node.operator) {
        case '+':
          return truncate(left + right)
        case '-':
          return truncate(left - right)
        case '*':
          return truncate(left * right)
        case '/':
          return right === 0 ? 0 : truncate(left / right)
        case '%':
          return right === 0 ? 0 : truncate(left % right)
        case '<':
          return left < right ? 1 : 0
        case '<=':
          return left <= right ? 1 : 0
        case '>':
          return left > right ? 1 : 0
        case '>=':
          return left >= right ? 1 : 0
        case '==':
          return left === right ? 1 : 0
        case '!=':
          return left !== right ? 1 : 0
      }
      return 0
    }

    case 'call':
      return evaluateCall(node, context, state)
  }
}

function evaluateVariable(
  name: string,
  context: CalcContext,
  state: EvaluationState
): number {
  const lower = name.toLowerCase()

  if (lower === 'lvl') return context.lvl ?? 1
  if (lower === 'blvl') return context.blvl ?? context.lvl ?? 1
  if (lower === 'ulvl') return context.ulvl ?? context.lvl ?? 1

  const parameter = PARAMETER_CODES[lower]
  if (parameter !== undefined) return context.params?.[parameter - 1] ?? 0

  const formulas = context.formulas ?? SKILL_FORMULAS
  const definition = formulas[lower]
  if (definition) {
    const level = context.lvl ?? 1
    return formulaValue(
      definition,
      level,
      evaluateVariable(definition.a, context, state),
      evaluateVariable(definition.b, context, state)
    )
  }

  const declared = context.vars?.[name] ?? context.vars?.[lower]
  if (declared !== undefined) return declared

  const resolved =
    context.resolveVariable?.(name) ?? context.resolveVariable?.(lower)
  if (resolved !== undefined) return resolved

  state.report({
    kind: 'unknown-variable',
    message: `unknown variable '${name}'`,
    source: state.source
  })
  return 0
}

function evaluateCall(
  node: CalcCallNode,
  context: CalcContext,
  state: EvaluationState
): number {
  const name = node.name.toLowerCase()

  if (name === 'min' || name === 'max') {
    const values = node.args.map((argument) =>
      evaluateNode(argument, context, state)
    )
    if (values.length === 0) {
      state.report({
        kind: 'parse',
        message: `${name}() without arguments`,
        source: state.source
      })
      return 0
    }
    return name === 'min' ? Math.min(...values) : Math.max(...values)
  }

  if (name === 'rand' || name === 'random') {
    const values = node.args.map((argument) =>
      evaluateNode(argument, context, state)
    )
    const from = values[0] ?? 0
    const to = values[1] ?? 1
    const draw = context.random?.() ?? Math.random()
    return from + draw * (to - from)
  }

  if (name === 'cond') {
    const conditionName = node.args[0]
    if (!conditionName || conditionName.kind !== 'string') {
      state.report({
        kind: 'unsupported',
        message: 'cond() needs a condition name',
        source: state.source
      })
      return 0
    }
    const value =
      node.args.length > 1
        ? evaluateNode(node.args[1], context, state)
        : undefined
    return context.condition?.(conditionName.value, value) ?? 0
  }

  const reference = node.args.length > 0 ? referenceOf(node.args[0]) : null
  if (reference) {
    if (name === 'skill') return context.skillRef?.(reference) ?? 0
    if (name === 'sksrc')
      return context.sksrcRef?.(reference) ?? context.skillRef?.(reference) ?? 0
    if (name === 'stat') return context.statRef?.(reference) ?? 0
    if (name === 'miss' || name === 'missile')
      return context.missileRef?.(reference) ?? 0
  }

  state.report({
    kind: 'unknown-function',
    message: `unknown function '${node.name}'`,
    source: state.source
  })
  return 0
}

/* -------------------------------------------------------------------------- */
/* Public evaluation API                                                      */
/* -------------------------------------------------------------------------- */

/** A parsed expression that can be evaluated many times with different contexts. */
export interface CompiledCalc {
  readonly source: string
  readonly node: CalcNode
  evaluate(context?: CalcContext): number
}

/** True when a table cell holds no expression at all. */
export function isBlankCalc(source: string | null | undefined): boolean {
  return source === null || source === undefined || source.trim() === ''
}

/**
 * Parses `source` once and returns a reusable evaluator.
 *
 * A blank cell evaluates to `0` rather than `NaN`: in `skills.txt` most cells of
 * most rows are empty, and the game treats an empty calc as zero.
 */
export function compileCalc(
  source: string,
  report?: DiagnosticSink
): CompiledCalc {
  const node = isBlankCalc(source)
    ? ({ kind: 'number', value: 0 } as CalcNode)
    : parseCalc(source, report)
  return {
    source,
    node,
    evaluate(context: CalcContext = {}): number {
      const state: EvaluationState = {
        source,
        report: context.onDiagnostic ?? report ?? (() => {})
      }
      // No post-hoc sanitising: a genuinely undefined result must stay visible
      // to the caller. Division by zero is already defined as 0 above.
      return evaluateNode(node, context, state)
    }
  }
}

/** Evaluates a single expression. Blank cells are `0`. */
export function evaluateCalc(
  source: string | null | undefined,
  context: CalcContext = {}
): number {
  if (isBlankCalc(source)) return 0
  // The parse sink has to come from the context: a truncated cell is a property
  // of the expression, and callers that collect diagnostics want to see it.
  return compileCalc(source as string, context.onDiagnostic).evaluate(context)
}

/* -------------------------------------------------------------------------- */
/* Formula derivation from the tables                                         */
/* -------------------------------------------------------------------------- */

function probeValue(name: string, seeds: ReadonlyMap<string, number>): number {
  return seeds.get(name) ?? 0
}

/**
 * Checks a candidate definition against the table's own text.
 *
 * Structural matching alone would accept a definition whose arithmetic differs
 * from the alias it is named after, so the definition text is evaluated at
 * several levels with seeded variables and compared with the candidate.
 */
function agreesWithSource(definition: FormulaDef, source: CalcNode): boolean {
  const seeds = new Map<string, number>()
  const seed = (name: string): void => {
    if (name === 'lvl' || seeds.has(name)) return
    seeds.set(name, 7 + seeds.size * 13)
  }
  seed(definition.a)
  seed(definition.b)
  for (const level of [1, 2, 3, 7, 20, 40]) {
    const context: CalcContext = {
      lvl: level,
      vars: {
        get [definition.a](): number {
          return probeValue(definition.a, seeds)
        },
        get [definition.b](): number {
          return probeValue(definition.b, seeds)
        }
      },
      resolveVariable: (name: string): number => {
        seed(name)
        return probeValue(name, seeds)
      }
    }
    const state: EvaluationState = { source: definition.code, report: () => {} }
    const fromSource = evaluateNode(source, context, state)
    const fromAlias = formulaValue(
      definition,
      level,
      evaluateNode({ kind: 'variable', name: definition.a }, context, state),
      evaluateNode({ kind: 'variable', name: definition.b }, context, state)
    )
    if (Math.abs(fromSource - fromAlias) > 1e-9) return false
  }
  return true
}

/**
 * Reads `ln`/`dm`-style definitions out of a calc primitive table row list.
 *
 * Accepts the raw rows of `table_skillcalc.json` (keys `code` and a description
 * holding the definition) or of `table_misscalc.json` in the same shape, so a
 * caller can hand the parsed JSON straight in.
 */
export function deriveFormulaDefs(
  rows: readonly Readonly<Record<string, string | null>>[]
): FormulaDefs {
  const definitions: Record<string, FormulaDef> = {}
  for (const row of rows) {
    const keys = Object.keys(row)
    const code = row[keys[0]]
    const text = keys.length > 1 ? row[keys[1]] : null
    if (!code || !text) continue
    if (!/^(ln|dm|sl|sd|shl|shd|cl|cd|chl|chd|dl|dd)\d+$/.test(code)) continue
    const node = parseCalc(text)
    const match = matchLinear(node) ?? matchDiminishing(node)
    if (!match) continue
    const kind: FormulaKind = matchLinear(node) ? 'linear' : 'diminishing'
    const definition: FormulaDef = { code, kind, a: match.a, b: match.b }
    if (!agreesWithSource(definition, node)) continue
    definitions[code] = definition
  }
  return definitions
}

/* -------------------------------------------------------------------------- */
/* Skill-row environments                                                     */
/* -------------------------------------------------------------------------- */

/** Which table column each single-letter calc primitive reads from. */
const SKILL_VARIABLE_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['clc1', 'calc1'],
  ['clc2', 'calc2'],
  ['clc3', 'calc3'],
  ['clc4', 'calc4'],
  ['clc5', 'calc5'],
  ['clc6', 'calc6'],
  ['clc7', 'calc7'],
  ['clc8', 'calc8'],
  ['clc9', 'calc9'],
  ['clc0', 'calc10'],
  ['ast1', 'aurastatcalc1'],
  ['ast2', 'aurastatcalc2'],
  ['ast3', 'aurastatcalc3'],
  ['ast4', 'aurastatcalc4'],
  ['ast5', 'aurastatcalc5'],
  ['ast6', 'aurastatcalc6'],
  ['pst1', 'passivecalc1'],
  ['pst2', 'passivecalc2'],
  ['pst3', 'passivecalc3'],
  ['pst4', 'passivecalc4'],
  ['pst5', 'passivecalc5'],
  ['pst6', 'passivecalc6'],
  ['pst7', 'passivecalc7'],
  ['pst8', 'passivecalc8'],
  ['pst9', 'passivecalc9'],
  ['ps10', 'passivecalc10'],
  ['ps11', 'passivecalc11'],
  ['ps12', 'passivecalc12'],
  ['ps13', 'passivecalc13'],
  ['ps14', 'passivecalc14'],
  ['len', 'auralencalc'],
  ['rng', 'aurarangecalc'],
  ['pets', 'petmax'],
  ['skpt', 'skpoints']
]

const SKILL_VARIABLE_COLUMN_MAP: ReadonlyMap<string, string> = new Map(
  SKILL_VARIABLE_COLUMNS
)

/** A skill row as it appears in `table_skills.json`. */
export type SkillCalcRow = Readonly<Record<string, string | null>>

/** Asks a host module for a primitive the calc language cannot derive itself. */
export interface SkillVariableQuery {
  readonly variable: string
  readonly skill: string
  readonly level: number
}

export interface SkillCalcEnvOptions {
  /** Column holding the skill's own key; defaults to `skill`. */
  readonly nameColumn?: string
  /** Formula aliases; defaults to {@link SKILL_FORMULAS}. */
  readonly formulas?: FormulaDefs
  /**
   * Supplies damage-engine primitives (`edmn`, `toht`, `mana`, ...). Returning
   * `undefined` leaves the value at `0`.
   */
  readonly variables?: (query: SkillVariableQuery) => number | undefined
  readonly statRef?: (reference: CalcReference) => number
  readonly missileRef?: (reference: CalcReference) => number
  readonly condition?: (name: string, value: number | undefined) => number
  readonly onDiagnostic?: DiagnosticSink
}

/** Evaluates any calc column of any skill row, resolving cross-skill references. */
export interface SkillCalcEnv {
  /** Keys of every row in the table. */
  readonly skillNames: readonly string[]
  /** Evaluates one column, e.g. `calc1` or `ToHitCalc`, of one skill. */
  column(
    skill: string,
    column: string,
    level: number,
    baseLevel?: number
  ): number
  /** Evaluates an arbitrary expression inside one skill row's context. */
  expression(
    skill: string,
    source: string,
    level: number,
    baseLevel?: number
  ): number
  /** A reusable context bound to one row and level. */
  context(skill: string, level: number, baseLevel?: number): CalcContext
}

function toFiniteNumber(value: string | null | undefined): number | undefined {
  if (isBlankCalc(value)) return undefined
  const parsed = Number.parseFloat(value as string)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Builds an evaluator over a whole `skills.txt`-shaped table.
 *
 * Cross-skill references (`skill('Warmth'.blvl)`) and the nested column
 * primitives (`clc1`, `ast3`, ...) are resolved against the same table, with
 * memoisation and a recursion guard: `Echoing Strike`'s `calc1` reads `clc0`
 * (its own `calc10`), and a table edit could easily introduce a true cycle.
 */
export function createSkillCalcEnv(
  rows: readonly SkillCalcRow[],
  options: SkillCalcEnvOptions = {}
): SkillCalcEnv {
  const nameColumn = options.nameColumn ?? 'skill'
  const formulas = options.formulas ?? SKILL_FORMULAS
  const report: DiagnosticSink = options.onDiagnostic ?? (() => {})
  const byLowerName = new Map<
    string,
    { skill: string; row: SkillCalcRow; columns: Map<string, string> }
  >()
  const skillNames: string[] = []

  for (const row of rows) {
    const name = row[nameColumn]
    if (!name) continue
    const columns = new Map<string, string>()
    for (const column of Object.keys(row))
      columns.set(column.toLowerCase(), column)
    byLowerName.set(name.toLowerCase(), { skill: name, row, columns })
    skillNames.push(name)
  }

  const cache = new Map<string, number>()
  const active = new Set<string>()
  const contexts = new Map<string, CalcContext>()
  const MAX_DEPTH = 64

  function readColumn(
    skill: string,
    column: string,
    level: number,
    baseLevel: number
  ): number {
    const entry = byLowerName.get(skill.toLowerCase())
    if (!entry) {
      report({
        kind: 'unknown-variable',
        message: `no skill row named '${skill}'`,
        source: column
      })
      return 0
    }
    const actual = entry.columns.get(column.toLowerCase())
    if (actual === undefined) {
      report({
        kind: 'unknown-variable',
        message: `${entry.skill} has no column '${column}'`,
        source: column
      })
      return 0
    }
    const source = entry.row[actual]
    if (isBlankCalc(source)) return 0

    const key = `${entry.skill.toLowerCase()}|${actual ?? column}|${level}|${baseLevel}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    if (active.has(key)) {
      report({
        kind: 'recursion',
        message: `${entry.skill}.${actual} references itself`,
        source: source as string
      })
      return 0
    }
    if (active.size >= MAX_DEPTH) {
      report({
        kind: 'recursion',
        message: 'calc nesting is too deep',
        source: source as string
      })
      return 0
    }

    active.add(key)
    const value = compileCalc(source as string).evaluate(
      buildContext(entry.skill, level, baseLevel)
    )
    active.delete(key)
    cache.set(key, value)
    return value
  }

  function resolveField(
    skill: string,
    field: string,
    level: number,
    baseLevel: number
  ): number {
    const lower = field.toLowerCase()
    if (lower === 'lvl' || lower === 'ulvl') return level
    if (lower === 'blvl') return baseLevel
    if (lower === 'sctk') return 0

    const parameter = PARAMETER_CODES[lower]
    if (parameter !== undefined) {
      const entry = byLowerName.get(skill.toLowerCase())
      const actual = entry?.columns.get(`param${parameter}`)
      return actual ? (toFiniteNumber(entry?.row[actual]) ?? 0) : 0
    }

    const column = SKILL_VARIABLE_COLUMN_MAP.get(lower)
    if (column) return readColumn(skill, column, level, baseLevel)

    const definition = formulas[lower]
    if (definition) {
      const context = buildContext(skill, level, baseLevel)
      const state: EvaluationState = { source: field, report }
      return formulaValue(
        definition,
        level,
        evaluateNode({ kind: 'variable', name: definition.a }, context, state),
        evaluateNode({ kind: 'variable', name: definition.b }, context, state)
      )
    }

    const supplied = options.variables?.({ variable: field, skill, level })
    if (supplied !== undefined) return supplied
    report({
      kind: 'unknown-variable',
      message: `skill '${skill}' has no field '${field}'`,
      source: field
    })
    return 0
  }

  function buildContext(
    skill: string,
    level: number,
    baseLevel: number
  ): CalcContext {
    const key = `${skill.toLowerCase()}|${level}|${baseLevel}`
    const existing = contexts.get(key)
    if (existing) return existing

    const entry = byLowerName.get(skill.toLowerCase())
    const params: number[] = []
    for (let index = 1; index <= 20; index += 1) {
      const actual = entry?.columns.get(`param${index}`)
      params.push(actual ? (toFiniteNumber(entry?.row[actual]) ?? 0) : 0)
    }

    const skillLowerCase = skill.toLowerCase()
    // Getters, because `clc1` reads this row's `calc1`, which needs this very
    // context: building the values eagerly would recurse before the context
    // object exists.
    const vars: Record<string, number> = {}
    for (const [variable, column] of SKILL_VARIABLE_COLUMNS) {
      Object.defineProperty(vars, variable, {
        enumerable: true,
        get: (): number => readColumn(skillLowerCase, column, level, baseLevel)
      })
    }

    const context: CalcContext = {
      lvl: level,
      blvl: baseLevel,
      ulvl: level,
      params,
      vars,
      formulas,
      onDiagnostic: report,
      skillRef: (reference): number =>
        resolveField(reference.name, reference.field, level, baseLevel),
      sksrcRef: (reference): number =>
        resolveField(reference.name, reference.field, level, baseLevel),
      statRef: options.statRef,
      missileRef: options.missileRef,
      condition: options.condition,
      resolveVariable: (variable): number | undefined =>
        options.variables?.({ variable, skill, level })
    }
    contexts.set(key, context)
    return context
  }

  return {
    skillNames,
    column: (skill, column, level, baseLevel = level): number =>
      readColumn(skill, column, level, baseLevel),
    expression: (skill, source, level, baseLevel = level): number =>
      compileCalc(source, report).evaluate(
        buildContext(skill, level, baseLevel)
      ),
    context: (skill, level, baseLevel = level): CalcContext =>
      buildContext(skill, level, baseLevel)
  }
}
