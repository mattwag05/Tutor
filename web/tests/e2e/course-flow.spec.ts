import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type CourseFixture = {
  id: string;
  title: string;
  topic: string;
  language: "en-US";
  personalization: {
    depth: "intermediate";
    audience: "student";
    style: "narrative";
  };
  generationPreferences: {
    focus: "learning";
    length: "medium";
    complexity: "intermediate";
    initialFormat: "lesson";
    selectedFormats: ["lesson"];
  };
  citations: Record<string, { id: string; text: string; source: string; url: string }>;
  sections: Array<Record<string, unknown>>;
};

const COURSE_FORMATS = [
  "Lesson",
  "Podcast",
  "Flash Cards",
  "Study Guide",
  "Quiz",
  "Diagram",
];

function makeCourse(id: string): CourseFixture {
  return {
    id,
    title: "Decision Making Without Overthinking",
    topic: "Decision making without overthinking",
    language: "en-US",
    personalization: { depth: "intermediate", audience: "student", style: "narrative" },
    generationPreferences: {
      focus: "learning",
      length: "medium",
      complexity: "intermediate",
      initialFormat: "lesson",
      selectedFormats: ["lesson"],
    },
    citations: {
      src_1: {
        id: "src_1",
        text: "Bounded rationality describes how people make decisions under limited time, attention, and information.",
        source: "Decision research note",
        url: "https://example.com/bounded-rationality",
      },
      src_2: {
        id: "src_2",
        text: "Precommitment and decision rules can reduce rumination by moving repeated choices into reusable defaults.",
        source: "Learning lab brief",
        url: "https://example.com/precommitment",
      },
    },
    sections: [
      {
        id: "s1",
        order: 1,
        title: "Why Overthinking Feels Useful",
        description: "Separate useful analysis from rumination.",
        status: "ready",
        goDeeperPrompts: [
          "Build a decision checklist",
          "Show a worked example",
          "Explain bounded rationality",
        ],
        blocks: [
          {
            id: "b1",
            type: "prose",
            markdown:
              "Overthinking often starts as a reasonable attempt to avoid regret. The problem is that more analysis stops improving the decision once the key tradeoffs are visible. {{cite:src_1}}",
          },
          { id: "b2", type: "heading", level: 2, text: "A practical cutoff" },
          {
            id: "b3",
            type: "prose",
            markdown:
              "Use a small rule: define the decision, list the reversible and irreversible parts, then choose the next action you can test within a fixed window.",
          },
          {
            id: "b4",
            type: "multipleChoiceQuiz",
            question: "What is the main purpose of a decision cutoff?",
            choices: [
              "To ignore evidence",
              "To prevent analysis from turning into rumination",
              "To make every choice permanent",
            ],
            correctIndex: 1,
            explanation: "A cutoff protects useful thinking while keeping the decision moving.",
          },
        ],
      },
      {
        id: "s2",
        order: 2,
        title: "Build Better Defaults",
        description: "Use reusable rules for recurring choices.",
        status: "ready",
        goDeeperPrompts: [
          "Create defaults for work decisions",
          "Compare defaults and habits",
          "Make this beginner-friendly",
        ],
        blocks: [
          {
            id: "b5",
            type: "prose",
            markdown:
              "Defaults are not shortcuts around judgment. They are stored judgment for situations you expect to repeat. {{cite:src_2}}",
          },
          {
            id: "b6",
            type: "pullQuote",
            text: "A good default lowers the cost of starting while leaving room to override.",
            attribution: "Tutor QA fixture",
            citationId: "src_2",
          },
          {
            id: "b7",
            type: "fillBlankQuiz",
            question: "A reusable decision rule is most helpful for ___ choices.",
            correctAnswer: "B",
            choices: ["random", "recurring", "impossible"],
            explanation: "Recurring choices are where defaults reduce repeated cognitive load.",
          },
        ],
      },
    ],
  };
}

async function createCourse(request: APIRequestContext, id: string) {
  await request.delete(`/api/course/${id}`);
  const response = await request.post("/api/course", { data: makeCourse(id) });
  expect(response.ok(), await response.text()).toBe(true);
}

async function deleteCourse(request: APIRequestContext, id: string) {
  await request.delete(`/api/course/${id}`);
}

async function expectNoConsoleErrors(page: Page, errors: string[]) {
  await page.waitForTimeout(100);
  expect(errors).toEqual([]);
}

test.describe("Tutor course flow", () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    test.info().annotations.push({
      type: "console-errors",
      description: JSON.stringify(consoleErrors),
    });
  });

  test("creator renders and selects every v1 format", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/course");
    await expect(page).toHaveTitle(/Tutor/);
    await expect(page.getByRole("heading", { name: "Build a course" })).toBeVisible();
    await expect(page.getByPlaceholder("Ask Tutor to build a course about...")).toBeVisible();

    for (const label of COURSE_FORMATS) {
      const button = page.getByRole("button", { name: label, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
    }

    await expectNoConsoleErrors(page, errors);
  });

  test("reader progress, drawers, sources, formats, checks, and follow-ups work", async ({
    page,
    request,
  }) => {
    const id = `qa-course-flow-${test.info().project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await createCourse(request, id);
    await page.route("**/api/generate/course-section", async (route) => {
      const body = route.request().postDataJSON() as {
        section?: { id: string; order: number; title: string; description?: string };
      };
      const section = body.section;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          section: {
            id: section?.id ?? "follow_up",
            order: section?.order ?? 2,
            title: section?.title ?? "Follow-up section",
            description: section?.description,
            status: "ready",
            goDeeperPrompts: [],
            blocks: [
              {
                id: `${section?.id ?? "follow_up"}_b1`,
                type: "prose",
                markdown: `A focused follow-up lesson for ${section?.title ?? "this question"}.`,
              },
            ],
          },
          citations: [],
        }),
      });
    });
    await page.route("**/api/quiz/attempts", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "qa-attempt", ok: true }),
      });
    });

    try {
      await page.goto(`/course/${id}`);
      await expect(page.getByRole("heading", { name: "Why Overthinking Feels Useful" })).toBeVisible();
      await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
      await expect(page.getByRole("button", { name: "Advance" })).toHaveCount(0);

      await expect(page.locator("body")).not.toContainText("Podcast");
      await page.getByRole("button", { name: "Open table of contents" }).click();
      const tocDialog = page.getByRole("dialog", { name: "Course contents" });
      await expect(tocDialog).toBeVisible();
      await expect(tocDialog.getByRole("button", { name: "Podcast" })).toBeVisible();
      await tocDialog.getByRole("button", { name: "Why Overthinking Feels Useful", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Course contents" })).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText("Podcast");

      await page.getByRole("button", { name: "2 Sources" }).click();
      await expect(page.getByRole("dialog", { name: "Sources" })).toBeVisible();
      await expect(page.getByText("Bounded rationality describes")).toBeVisible();
      await page.getByRole("button", { name: "Close" }).click();

      await page.getByRole("button", { name: "New Format" }).click();
      for (const label of COURSE_FORMATS) {
        await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
      }
      await page.getByRole("button", { name: "Close" }).click();

      await page
        .getByRole("button", { name: "To prevent analysis from turning into rumination" })
        .click();
      await expect(page.getByText("Correct")).toBeVisible();

      const scrollRoot = page.locator(".h-dvh");
      await scrollRoot.evaluate((el) => el.scrollTo({ top: 900 }));
      await expect
        .poll(async () => Number(await page.getByRole("progressbar").getAttribute("aria-valuenow")))
        .toBeGreaterThanOrEqual(70);
      await expect(page.getByRole("button", { name: "Advance" })).toBeVisible();

      await page.getByRole("button", { name: "Build a decision checklist" }).click();
      await expect(page.getByRole("heading", { name: "Build a decision checklist" })).toBeVisible();
      await expect(page.getByText("A focused follow-up lesson for Build a decision checklist.")).toBeVisible();

      await page.getByPlaceholder("Ask a question...").fill("Explain with a workplace example");
      await page.getByRole("button", { name: "Send question" }).click();
      await expect(page.getByRole("heading", { name: "Explain with a workplace example" })).toBeVisible();
      await expect(page.getByText("A focused follow-up lesson for Explain with a workplace example.")).toBeVisible();

      await expectNoConsoleErrors(page, errors);
    } finally {
      await deleteCourse(request, id);
    }
  });
});
