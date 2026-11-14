window.__ModuleLoader__.load({
	id: "dsh-structured-document",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		// src/client/index.tsx
		/**
		* dsh-structured-document —— 浏览器半边(F010 设置页插件配置卡 + F011 外观对齐)。
		*
		* 卡片注册在 `settings.plugin.item` slot 上,**key 即设置命名空间**(= 包名);
		* 设置页把宿主服务注册的命名空间与该 key 配对派发,因此卡片自己拥有控件与文案。
		*
		* 读写都经 `ctx.settingsScope.bind({ namespace })`:
		*  - 读:快照的 `status` / `value` / `base` / `user` / `revision` / `writable`;
		*  - 写:`mutate`(一次保存提交一条有序 mutation,带 `expectedRevision` 栅栏)。
		*
		* 软依赖:`settingsScope` **不**写进 `exports.inject`(缺服务会让整个客户端半边不
		* 挂载),改用 `ctx.inject(['settingsScope'], …)` 在服务可用时才注册卡片;服务
		* 缺失或命名空间未被宿主服务时不渲染卡片,也不影响插件其它能力。
		*
		* 命名空间字符串在此重复声明而不从宿主代码 import:浏览器半边不得依赖宿主模块
		* (客户端 bundle 的纯度门禁禁止跨半边 value import)。一致性由
		* `tests/unit/settings-config.spec.ts`(宿主侧 `SETTINGS_NAMESPACE`)与
		* `tests/unit/client-card.spec.ts`(卡片注册的 slot key)共同断言。
		*
		* F011 外观:不 import `@deepseek-ai/dsh-client-ui-settings-plugins` 的值(纯度门禁
		* 会拦),而是用同一套设计令牌、按宿主 `PluginCard` 的布局逐类对齐(配方见
		* `.agents/skills/dsh-plugin-develop/references/config-ui.md` §8):可折叠头部
		* (`<button>` + `aria-expanded`/`aria-controls`)、带分隔线的设置行、控件行内右对齐、
		* 保存与放弃在右下角操作行。
		*/
		/** 设置命名空间 = 包名(与宿主 `src/plugin/config.ts` 的 `SETTINGS_NAMESPACE` 一致)。 */
		const NAMESPACE = "dsh-structured-document";
		/** 卡片头部显示的版本号。 */
		const PLUGIN_VERSION = "0.2.2-rc.3+rev.1";
		/** 必需服务:`slots` 是浏览器半边的立足点(没有它就没有 UI)。 */
		const inject = ["slots"];
		/**
		* 挂载浏览器半边。
		* @param ctx - 浏览器侧 cordis context。
		*/
		function apply(ctx) {
			injectStyle();
			ctx.inject(["settingsScope"], (sctx) => {
				const binder = sctx.settingsScope;
				if (binder === void 0) return;
				const scope = binder.bind({ namespace: NAMESPACE });
				ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
					name: "settings.plugin.item",
					key: NAMESPACE
				}, () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsCard, { scope })));
			});
		}
		/**
		* 设置卡片:可折叠头部 + 三个设置行 + 右下角操作行。
		*
		* 外观按宿主 `PluginCard` 对齐;折叠是**卡片本地状态**,收起只隐藏主体——组件保持
		* 挂载,因此未保存草稿不因收起丢失。
		* @param props - 绑定的设置命名空间读写面,以及初始展开状态(默认收起,与宿主卡片一致;
		*   该参数同时让无渲染器的用例能直接断言展开态结构)。
		*/
		function SettingsCard({ scope, initiallyOpen = false }) {
			const [snapshot, setSnapshot] = (0, react.useState)(() => scope.getSnapshot());
			const [profileDraft, setProfileDraft] = (0, react.useState)(void 0);
			const [autoSaveDraft, setAutoSaveDraft] = (0, react.useState)(void 0);
			const [undoDraft, setUndoDraft] = (0, react.useState)(void 0);
			/** 已暂存“重置”的字段:保存时 unset,重新继承组装层。 */
			const [resetFields, setResetFields] = (0, react.useState)([]);
			const [saving, setSaving] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)("");
			/** 卡片本地展开状态(默认收起,与宿主卡片一致)。 */
			const [open, setOpen] = (0, react.useState)(initiallyOpen);
			/** 头部 `aria-controls` 指向的主体 id(useId 保证同页多实例唯一)。 */
			const bodyId = `dsd-settings-body-${(0, react.useId)()}`;
			(0, react.useEffect)(() => scope.subscribe(() => setSnapshot(scope.getSnapshot())), [scope]);
			if (snapshot.status === "unavailable") return null;
			const stored = snapshot.value;
			const base = recordOf(snapshot.base);
			const disabled = !snapshot.writable || snapshot.status === "loading" || saving;
			const staged = (field) => field === "defaultProfile" ? profileDraft : field === "autoSave" ? autoSaveDraft : undoDraft;
			const isReset = (field) => resetFields.includes(field);
			/** 是否“被覆盖”:暂存的写入预告保存结果,否则看该字段是否出现在原始用户层。 */
			const overridden = (field) => isReset(field) ? false : staged(field) !== void 0 ? true : field in recordOf(snapshot.user);
			const profileShown = isReset("defaultProfile") ? inheritedString(base, "defaultProfile", "meeting") : profileDraft ?? stored?.defaultProfile ?? inheritedString(base, "defaultProfile", "meeting");
			const autoSaveShown = isReset("autoSave") ? inheritedBoolean(base, "autoSave", true) : autoSaveDraft ?? stored?.autoSave ?? inheritedBoolean(base, "autoSave", true);
			const undoShown = isReset("maxUndoSteps") ? String(inheritedNumber(base, "maxUndoSteps", 100)) : undoDraft ?? String(stored?.maxUndoSteps ?? inheritedNumber(base, "maxUndoSteps", 100));
			const undoInvalid = !isReset("maxUndoSteps") && undoDraft !== void 0 && !isUndoSteps(undoDraft);
			const dirty = profileDraft !== void 0 || autoSaveDraft !== void 0 || undoDraft !== void 0 || resetFields.length > 0;
			/** 任一层被用户覆盖(用于头部覆盖状态徽标)。 */
			const anyOverridden = FIELDS.some((field) => overridden(field));
			const stage = (field, value) => {
				if (field === "defaultProfile") setProfileDraft(String(value));
				else if (field === "autoSave") setAutoSaveDraft(Boolean(value));
				else setUndoDraft(String(value));
				setResetFields((current) => current.filter((item) => item !== field));
				setFailure("");
			};
			const resetField = (field) => {
				if (field === "defaultProfile") setProfileDraft(void 0);
				else if (field === "autoSave") setAutoSaveDraft(void 0);
				else setUndoDraft(void 0);
				setResetFields((current) => current.includes(field) ? current : [...current, field]);
				setFailure("");
			};
			const clearDrafts = () => {
				setProfileDraft(void 0);
				setAutoSaveDraft(void 0);
				setUndoDraft(void 0);
				setResetFields([]);
			};
			const save = () => {
				if (saving) return;
				if (undoInvalid) {
					setFailure("撤销深度必须是 ≥ 1 的整数。");
					return;
				}
				const ops = [];
				if (isReset("defaultProfile")) ops.push({
					op: "unset",
					path: ["defaultProfile"]
				});
				else if (profileDraft !== void 0) ops.push({
					op: "set",
					path: ["defaultProfile"],
					value: profileDraft
				});
				if (isReset("autoSave")) ops.push({
					op: "unset",
					path: ["autoSave"]
				});
				else if (autoSaveDraft !== void 0) ops.push({
					op: "set",
					path: ["autoSave"],
					value: autoSaveDraft
				});
				if (isReset("maxUndoSteps")) ops.push({
					op: "unset",
					path: ["maxUndoSteps"]
				});
				else if (undoDraft !== void 0) ops.push({
					op: "set",
					path: ["maxUndoSteps"],
					value: Number(undoDraft.trim())
				});
				if (ops.length === 0) return;
				setSaving(true);
				setFailure("");
				scope.mutate(ops, snapshot.revision).then(() => {
					setSaving(false);
					clearDrafts();
					setSnapshot(scope.getSnapshot());
				}, (error) => {
					setSaving(false);
					setFailure(readError(error));
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: open ? "dsd-card dsd-card-open" : "dsd-card",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "dsd-head",
					"aria-expanded": open,
					"aria-controls": bodyId,
					onClick: () => setOpen((current) => !current),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsd-head-text",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsd-name",
								children: ["Irving · 结构化文档", /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "dsd-version",
									children: [" v", PLUGIN_VERSION]
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsd-desc",
								children: "默认场景模板、自动保存与撤销深度;此处保存的用户值优先于组装配置。"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsd-badge",
							children: [" ", anyOverridden ? "用户覆盖" : "继承组装层"]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: open ? "dsd-chevron dsd-chevron-open" : "dsd-chevron",
							"aria-hidden": "true",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronDown, {})
						})
					]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsd-body",
					id: bodyId,
					children: [
						snapshot.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsd-readonly",
							role: "status",
							children: "正在读取设置…"
						}),
						!snapshot.writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsd-readonly",
							role: "status",
							children: "当前设置文档为只读。"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsd-row",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsd-label-box",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										className: "dsd-label",
										htmlFor: "dsd-profile",
										children: "默认场景模板"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsd-hint",
										children: "装载无 sidecar 历史的新文档时使用。"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									id: "dsd-profile",
									className: "dsd-input",
									value: profileShown,
									disabled,
									onChange: (event) => stage("defaultProfile", event.target.value),
									children: PROFILE_OPTIONS.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: option.id,
										children: option.label
									}, option.id))
								}),
								overridden("defaultProfile") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsd-reset",
									disabled,
									onClick: () => resetField("defaultProfile"),
									children: "重置为组装值"
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsd-row",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsd-label-box",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										className: "dsd-label",
										htmlFor: "dsd-autosave",
										children: "自动保存"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsd-hint",
										children: "关闭后普通修改保持脏状态,需要手动调用 save_document。"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									id: "dsd-autosave",
									type: "button",
									role: "switch",
									"aria-checked": autoSaveShown,
									className: autoSaveShown ? "dsd-switch dsd-switch-on" : "dsd-switch",
									disabled,
									onClick: () => stage("autoSave", !autoSaveShown),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsd-switch-knob",
										"aria-hidden": "true"
									})
								}),
								overridden("autoSave") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsd-reset",
									disabled,
									onClick: () => resetField("autoSave"),
									children: "重置为组装值"
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsd-row",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsd-label-box",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										className: "dsd-label",
										htmlFor: "dsd-undo",
										children: "撤销栈深度"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: undoInvalid ? "dsd-invalid" : "dsd-hint",
										children: undoInvalid ? "撤销深度必须是 ≥ 1 的整数。" : "可撤销的最近操作步数(整数,最小 1)。"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: "dsd-undo",
									className: "dsd-input dsd-number",
									type: "number",
									min: 1,
									step: 1,
									value: undoShown,
									disabled,
									onChange: (event) => stage("maxUndoSteps", event.target.value)
								}),
								overridden("maxUndoSteps") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsd-reset",
									disabled,
									onClick: () => resetField("maxUndoSteps"),
									children: "重置为组装值"
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsd-footer",
							children: [
								failure !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "dsd-failure",
									role: "alert",
									children: failure
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsd-discard",
									disabled: saving || !dirty,
									onClick: () => {
										clearDrafts();
										setFailure("");
									},
									children: "放弃修改"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dsd-save",
									disabled: disabled || !dirty,
									onClick: save,
									children: saving ? "保存中…" : "保存"
								})
							]
						})
					]
				})]
			});
		}
		/** 三个可编辑字段(头部覆盖徽标据此判断)。 */
		const FIELDS = [
			"defaultProfile",
			"autoSave",
			"maxUndoSteps"
		];
		/** 场景模板选项(卡片自建 select;官方字段件只有 numberField / textField)。 */
		const PROFILE_OPTIONS = [
			{
				id: "meeting",
				label: "会议纪要"
			},
			{
				id: "project",
				label: "项目管理"
			},
			{
				id: "thinking",
				label: "思路整理"
			}
		];
		/** 头部 chevron(16px;展开时 CSS 旋转 180°)。 */
		function ChevronDown() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M4 6l4 4 4-4",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}
		/** 草稿是否为合法撤销深度(整数且 ≥ 1);最终仍由宿主 schema 判定。 */
		function isUndoSteps(text) {
			const trimmed = text.trim();
			if (!/^\d+$/.test(trimmed)) return false;
			return Number(trimmed) >= 1;
		}
		/** 读取组装层某字段(缺失或类型不符时用兜底值)。 */
		function inheritedString(base, key, fallback) {
			const value = base[key];
			return typeof value === "string" && value !== "" ? value : fallback;
		}
		function inheritedBoolean(base, key, fallback) {
			const value = base[key];
			return typeof value === "boolean" ? value : fallback;
		}
		function inheritedNumber(base, key, fallback) {
			const value = base[key];
			return typeof value === "number" ? value : fallback;
		}
		/** 宽化读取普通对象(快照的 base / user 层)。 */
		function recordOf(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
		}
		/** 把写入失败翻译成用户能看懂的中文,并说明草稿已保留。 */
		function readError(error) {
			const code = typeof error === "object" && error !== null ? error.code : void 0;
			const message = error instanceof Error ? error.message : String(error ?? "");
			if (code === "SETTINGS_CONFLICT") return "设置已在别处被修改,已保留你的改动,请确认后重试。";
			return message === "" ? "保存失败,已保留你的改动。" : `保存失败,已保留你的改动:${message}`;
		}
		/**
		* 注入卡片样式(单一样式块,类名前缀 dsd-)。
		*
		* 卡片 chrome 的数值**以宿主 `PluginCard` 为准**(同页并列时对比的基准):`.5px` 边框 +
		* `--dsw-alias-border-l4` + `border-radius:16px`,展开态 `bg-layer-2` +
		* `border-color:label-dimmed`;主体/行/操作行的分隔线同为 `.5px border-l2`。其余布局数值
		* 照 `.agents/skills/dsh-plugin-develop/references/config-ui.md` §8 的配方。
		* 配色只用宿主真实存在的 `--dsw-alias-*` 令牌并给兜底值(兜底取自 dsh-client-ui-theme)。
		*/
		function injectStyle() {
			if (typeof document === "undefined" || document.getElementById("dsd-settings-style") !== null) return;
			const style = document.createElement("style");
			style.id = "dsd-settings-style";
			style.textContent = `
.dsd-card{display:block;min-width:0;border:.5px solid var(--dsw-alias-border-l4,#00000029);background:var(--dsw-alias-bg-layer-3,#fff);border-radius:16px;list-style:none;transition:border-color .16s,background .16s}
.dsd-card:hover{border-color:var(--dsw-alias-label-dimmed,#e1e5ee)}
.dsd-card-open{background:var(--dsw-alias-bg-layer-2,#fff);border-color:var(--dsw-alias-label-dimmed,#e1e5ee)}
.dsd-card *{box-sizing:border-box}
.dsd-head{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}
.dsd-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:-2px}
.dsd-head-text{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0}
.dsd-name{color:var(--dsw-alias-label-primary,#1f2328);font-size:15px;font-weight:600;line-height:1.4}
.dsd-version{color:var(--dsw-alias-label-tertiary,#8b93a1);font-variant-numeric:tabular-nums;font-size:12px;font-weight:400;line-height:20px}
.dsd-desc{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:13px;line-height:1.5}
.dsd-badge{flex:none;background:var(--dsw-alias-bg-layer-2,#eef0f4);color:var(--dsw-alias-label-secondary,#6b7280);border-radius:9px;padding:0 6px;font-size:11px;font-weight:600;line-height:17px;white-space:nowrap}
.dsd-chevron{display:inline-flex;flex:none;color:var(--dsw-alias-label-tertiary,#8b93a1);transition:transform .16s}
.dsd-chevron-open{transform:rotate(180deg)}
.dsd-body{border-top:.5px solid var(--dsw-alias-border-l2,#0000001a);margin:0 16px;padding-bottom:8px}
.dsd-row{display:flex;align-items:center;gap:12px;padding:12px 0}
.dsd-row+.dsd-row{border-top:.5px solid var(--dsw-alias-border-l2,#0000001a)}
.dsd-label-box{display:flex;flex-direction:column;flex:1;gap:3px;min-width:0}
.dsd-label{color:var(--dsw-alias-label-primary,#1f2328);font-size:13px;line-height:20px}
.dsd-hint{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:12px;line-height:18px}
.dsd-invalid{color:var(--dsw-alias-label-error,#dc2626);font-size:12px;line-height:18px}
.dsd-input{flex:none;max-width:40%;border:.5px solid var(--dsw-alias-border-l4,#00000029);background:var(--dsw-alias-bg-layer-3,#fff);color:var(--dsw-alias-label-primary,#1f2328);border-radius:7px;padding:6px 8px;font:inherit;font-size:12px;line-height:18px}
.dsd-number{width:84px}
.dsd-input:focus-visible{border-color:var(--dsw-alias-brand-primary,#4f6ef7);outline:none}
.dsd-switch{flex:none;position:relative;width:34px;height:20px;padding:0;border:.5px solid var(--dsw-alias-border-l4,#00000029);border-radius:10px;background:var(--dsw-alias-bg-layer-3,#fff);cursor:pointer;transition:background .16s,border-color .16s}
.dsd-switch-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#8b93a1);transition:transform .16s,background .16s}
.dsd-switch-on{background:var(--dsw-alias-brand-primary,#4f6ef7);border-color:var(--dsw-alias-brand-primary,#4f6ef7)}
.dsd-switch-on .dsd-switch-knob{transform:translateX(14px);background:#fff}
.dsd-reset{flex:none;border:0;background:0 0;color:var(--dsw-alias-label-secondary,#6b7280);cursor:pointer;font:inherit;font-size:12px;line-height:18px;padding:0}
.dsd-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary,#1f2328)}
.dsd-readonly{color:var(--dsw-alias-label-tertiary,#8b93a1);margin:12px 0 0;font-size:12px;line-height:1.5}
.dsd-footer{display:flex;justify-content:flex-end;align-items:center;gap:8px;border-top:.5px solid var(--dsw-alias-border-l2,#0000001a);padding:12px 0 4px}
.dsd-save,.dsd-discard{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}
.dsd-discard{border-color:var(--dsw-alias-border-l2,#0000001a);color:var(--dsw-alias-label-secondary,#6b7280);background:0 0}
.dsd-discard:hover:not(:disabled){color:var(--dsw-alias-label-primary,#1f2328);border-color:var(--dsw-alias-label-dimmed,#e1e5ee)}
.dsd-save{background:var(--dsw-alias-label-primary,#1f2328);color:var(--dsw-alias-bg-layer-3,#fff)}
.dsd-save:disabled,.dsd-discard:disabled,.dsd-reset:disabled,.dsd-input:disabled,.dsd-switch:disabled{cursor:not-allowed;opacity:.5}
.dsd-failure{flex:1;min-width:0;margin:0;color:var(--dsw-alias-label-error,#dc2626);font-size:12px;line-height:1.5}
`;
			document.head.appendChild(style);
		}
		exports.SettingsCard = SettingsCard;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
