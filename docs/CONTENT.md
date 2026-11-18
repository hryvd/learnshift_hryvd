# Local practice content

The app bundles 500 original multiple-choice practice questions: 100 each for Math, English, Filipino, Science, and Araling Panlipunan. Each subject has ten questions for each grade from 1 through 10. This is 100 per subject across all ten grades, not 100 per subject per grade. No question download or tutor API is needed for this feed. Answers and the score stay in the current feed session; existing app break-completion totals may sync for signed-in students.

Canonical content is `src/data/bank/*.json`. Each item has an ID, subject, grade, topic, prompt, four choices, a zero-based correct answer, and an explanation. English/Math/Science use English; Filipino/Araling Panlipunan use Filipino. The interface language does not translate the question bank. The existing adaptive secondary-school math bank is separate; these questions do not update its mastery model.

## Sources and review status

The topic selection uses general grade-school subject knowledge. The questions are newly authored, not copied from exam collections. Official DepEd curriculum references were requested during implementation:

- https://www.deped.gov.ph/matatag-curriculum/
- https://www.deped.gov.ph/k-to-12/about/k-to-12-basic-education-curriculum/

The environment's network proxy returned HTTP 403 for both. Their contents were **not retrieved or verified**, so this bank must not be described as DepEd-approved, curriculum-certified, or fully research-validated. Grade placements are provisional practice levels. In particular, early-grade science and civics may be taught through integrated learning areas. An educator should verify reading level, distractor quality, factual correctness, Filipino usage, and current curriculum sequencing before a public child-facing release. These 500 questions are a starter bank, not comprehensive curriculum coverage.

## Validation and Android export

Run `node scripts/validate-content.mjs`. It checks counts per subject and grade, IDs/prompts, four distinct choices, correct-answer indexes, required explanation fields, and equality with the Android asset. Capitalization questions intentionally have choices that differ by case.

After editing questions, run `node scripts/validate-content.mjs --write` to regenerate `modules/usage-monitor/android/src/main/assets/learnshift-questions.json`, then run the normal check again. Both platforms consume the same content. The checks verify structure, not educational accuracy.
