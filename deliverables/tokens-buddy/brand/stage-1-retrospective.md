# Stage 1 Retrospective: Brand Language Refinement

## Project

- Project slug: tokens-buddy
- Stage: 1 - Brand Language Refinement
- Date: 2026-04-28
- Purpose: summarize process issues for improving `ddm-product-visual-design`.

## What Went Wrong

### 1. Product Core Was Not Locked Early Enough

The process started from broad repository reading and brand wording, but did not first force a concise product-core statement.

For TokensBuddy, the decisive product core is:

> 在 cc-switch 的 Provider / Token 切换基础上，增加 Token 分享和交易。

This statement should have been established before generating tagline and capability-line candidates.

### 2. Early Options Were Feature-led Instead Of User-led

The first candidate set described product abilities such as management, routing, sharing, monetization, and tool integration. It did not sufficiently answer:

- Who is the primary user?
- What are they already doing today?
- What immediate pain makes them care?
- What is new compared with cc-switch?

This caused wording to feel generic even when technically correct.

### 3. The Skill Did Not Separate "Base Capability" From "New Value"

TokensBuddy has a layered product story:

- Base capability: cc-switch-style Token / Provider switching.
- New value: Token sharing and trading.
- Brand story: idle Token flow.

The skill did not explicitly ask for this hierarchy. As a result, some candidates over-emphasized general AI tool management, while others over-emphasized trading.

### 4. "Target User" Was Too Broad At First

The initial target users included AI coding users, Provider managers, small teams, idle quota holders, buyers, and advanced toolchain users. This was directionally useful but too broad for tagline creation.

The better segmentation is:

- Existing cc-switch / multi-provider switching users.
- AI developers with idle Token capacity.
- Friends or small teams needing temporary access.
- Market participants needing Token supply or demand.

### 5. The Skill Allowed Too Many Candidate Lines Too Early

Generating many slogan candidates before locking the product thesis made the comparison noisy.

The better sequence should be:

1. Product-core sentence.
2. Primary audience and current behavior.
3. Base capability vs new value.
4. Brand promise.
5. Only then generate 3-5 wording candidates.

### 6. "Safety And Trust" Was Treated As A Brand Concern, Not A Structural Requirement

Because Token sharing and trading are sensitive, trust should not be a late expert note. It should shape the whole language system:

- avoid "倒卖", "套利", "薅羊毛", "稳赚";
- emphasize controlled sharing, visible boundary, revocable access, and market rules;
- visually avoid exchange, gambling, and speculative finance cues.

### 7. The Confirmation Gate Was Too Coarse

Stage 1 asked for confirmation of brand language as a whole, but in practice the user confirmed one component first:

- Main tagline: 让闲置的 Token 流动起来

The skill should support partial confirmation:

- tagline confirmed;
- capability line pending;
- core narrative pending;
- short description pending.

## What Worked

- The staged gate prevented moving into visual direction too early.
- The decision log captured corrections and user choices.
- Expert synthesis helped reject misleading directions such as "Token exchange" or over-cute "Buddy" expression.
- The final tagline is short, user-owned, and aligned with the product's actual incremental value.

## Recommended Skill Improvements

### Add A Required Product-core Gate

Before Stage 1 wording generation, require:

- "This product is X built on top of Y, adding Z."
- "The new value over the predecessor/current behavior is..."
- "The product should not be mistaken for..."

### Add Base/New Value Mapping

For products evolving from an existing tool, require a map:

| Layer | Meaning | TokensBuddy example |
| --- | --- | --- |
| Base | What users already understand | cc-switch Provider / Token switching |
| New value | Why this product deserves a new identity | Token sharing and trading |
| Brand story | Emotional or visual narrative | idle Token flow |

### Add Target-user Prioritization Before Copy

Require the model to identify:

- primary user;
- secondary user;
- non-primary user;
- current behavior;
- strongest anxiety;
- trigger moment.

### Limit First-pass Copy Options

Generate no more than:

- 3 tagline candidates;
- 3 capability-line candidates;
- 3 core-narrative candidates;

Only expand after the user rejects or asks for more.

### Track Partial Decisions

Stage 1 should track:

- brand name: pending / confirmed;
- tagline: pending / confirmed;
- capability line: pending / confirmed;
- one-liner: pending / confirmed;
- short description: pending / confirmed;
- core narrative: pending / confirmed.

### Treat Risk Language As A First-class Constraint

For products involving credentials, money, sharing, or trading, require a trust-language pass before presenting final candidates.

## Current Stage 1 Status

- Brand main name: TokensBuddy
- Chinese assist name: Token 搭子
- Product core: 在 cc-switch 的 Provider / Token 切换基础上，增加 Token 分享和交易。
- Main tagline: confirmed
- Confirmed tagline: 让闲置的 Token 流动起来
- Capability line: pending
- Core narrative: pending
- Next step: refine capability line and core narrative before entering Stage 2 visual direction.
