#!/usr/bin/env bun
import { greet } from "@miel/core";

const name = process.argv[2] ?? "world";
console.log(greet(name));
