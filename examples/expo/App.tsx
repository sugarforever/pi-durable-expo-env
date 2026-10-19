import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { createExpoWorkspace } from "pi-expo-filesystem";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import {
  createReadTool,
  createWriteTool,
  createEditTool,
} from "@earendil-works/pi-durable/tools";
import { getOrThrow } from "@earendil-works/pi-durable/env";

// No account, model API, network request or access to user-selected files.
export default function App() {
  const [status, setStatus] = useState("Running…");
  useEffect(() => {
    void run();
  }, []);
  async function run() {
    setStatus("Running…");
    const env = createExpoWorkspace({ workspaceId: "self-test" });
    const checks: string[] = [];
    const assert = (value: boolean, name: string) => {
      if (!value) throw new Error(name);
      checks.push(`✓ ${name}`);
    };
    try {
      getOrThrow(
        await env.remove("fixtures", { recursive: true, force: true }, context),
      );
      const writeTool = createWriteTool(),
        editTool = createEditTool(),
        readTool = createReadTool();
      const api = { env } as Parameters<
        NonNullable<typeof writeTool.execute>
      >[1];
      await writeTool.execute!(
        { path: "tools.txt", content: "Hello Pi" },
        api,
        context,
      );
      await editTool.execute!(
        { path: "tools.txt", edits: [{ oldText: "Hello", newText: "你好" }] },
        api,
        context,
      );
      const output = await readTool.execute!(
        { path: "tools.txt" },
        api,
        context,
      );
      assert(
        JSON.stringify(output).includes("你好 Pi"),
        "Pi write / edit / read tools",
      );
      getOrThrow(await env.remove("tools.txt", undefined, context));

      getOrThrow(
        await env.writeFile(
          "fixtures/你好 %2e%2e.txt",
          "Hello Expo\n",
          context,
        ),
      );
      assert(
        getOrThrow(
          await env.readTextFile("fixtures/你好 %2e%2e.txt", context),
        ) === "Hello Expo\n",
        "Unicode and encoded filenames",
      );
      const reader = getOrThrow(
        await env.openBinaryReader(
          "fixtures/你好 %2e%2e.txt",
          undefined,
          context,
        ),
      );
      getOrThrow(
        await env.renameFile(
          "fixtures/你好 %2e%2e.txt",
          "fixtures/你好 %2e%2e.txt",
          context,
        ),
      );
      assert(
        getOrThrow(await env.exists("fixtures/你好 %2e%2e.txt", context)),
        "Self rename preserves source",
      );
      getOrThrow(
        await env.renameFile(
          "fixtures/你好 %2e%2e.txt",
          "fixtures/renamed.txt",
          context,
        ),
      );
      assert(
        new TextDecoder().decode(
          getOrThrow(await reader.read(0, 5, context)),
        ) === "Hello",
        "Snapshot survives rename",
      );
      await reader.close(context);
      await Promise.all(
        Array.from({ length: 10 }, () =>
          env.appendFile("fixtures/count.txt", "x", context).then(getOrThrow),
        ),
      );
      assert(
        getOrThrow(await env.readTextFile("fixtures/count.txt", context))
          .length === 10,
        "Serialized concurrent append",
      );
      assert(
        !(await env.writeFile("../escape.txt", "blocked", context)).ok,
        "Path traversal rejected",
      );
      assert(
        getOrThrow(await env.listDir("fixtures", context)).length === 2,
        "Directory listing",
      );
      const temp = getOrThrow(
        await env.createTempFile({ suffix: ".txt" }, context),
      );
      assert(getOrThrow(await env.exists(temp, context)), "Temporary file");
      getOrThrow(await env.remove(temp, undefined, context));
      getOrThrow(await env.remove("fixtures", { recursive: true }, context));
      setStatus(`All native checks passed\n\n${checks.join("\n")}`);
    } catch (e) {
      setStatus(`FAILED\n${String(e)}\n\n${checks.join("\n")}`);
    } finally {
      await env.remove("fixtures", { recursive: true, force: true }, context);
      await env.cleanup(context);
    }
  }
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Pi Filesystem</Text>
        <Text selectable style={styles.result}>
          {status}
        </Text>
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => void run()}
        >
          <Text>Run checks</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7f8f6" },
  content: { padding: 24, gap: 24 },
  title: { fontSize: 28, fontWeight: "600" },
  result: { fontSize: 17, lineHeight: 28 },
  button: {
    alignSelf: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#dce9dc",
  },
});
