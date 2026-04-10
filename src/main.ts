import {App, Modal, Notice, Plugin, Setting, TFile, normalizePath} from 'obsidian';

interface ExportOptions {
	includeCoverPage: boolean;
	includeTableOfContents: boolean;
	pageBreakAfterEachNote: boolean;
}

// The Obsidian type def does not expose executeCommandById and findCommand,
// but the functions are available. We extend App here so we don't get type errors when calling these.
interface AppWithCommands extends App {
	commands?: {
		findCommand: (id: string) => unknown;
		executeCommandById: (id: string) => Promise<void> | void;
	};
}

export default class ConsolidateToPdfPlugin extends Plugin {
	// We use HTML/CSS for page breaks becuase this works with Obsidian's PDF export, whereas markdown page break syntax does not always work as expected.
	private readonly pageBreakMarker = '<div class="vault-to-pdf-page-break"></div>';

	private getExportNotePath(): string {
		return normalizePath('__vault_pdf_export_source.md');
	}

	async onload() {
		// Add the CSS for page breaks in PDF export
		const styleEl = document.createElement('style');
		styleEl.textContent = '@media print { .vault-to-pdf-page-break { break-after: page; page-break-after: always; } }';
		document.head.appendChild(styleEl);
		this.register(() => styleEl.remove());

		this.addRibbonIcon('file-output', 'Consolidate vault to PDF', () => {
			void this.exportVaultToPdf();
		});

		this.addCommand({
			id: 'consolidate-vault-to-pdf',
			name: 'Consolidate vault to PDF',
			callback: () => {
				void this.exportVaultToPdf();
			}
		});
	}

	private async exportVaultToPdf(): Promise<void> {
		const markdownFiles = this.getSortedVaultFiles();

		if (markdownFiles.length === 0) {
			new Notice('No markdown files found in vault.');
			return;
		}

		const exportOptions = await this.promptExportOptions();
		if (!exportOptions) {
			new Notice('Export canceled.');
			return;
		}

		await this.deleteExistingExportFileIfAny();

		const progressNotice = new Notice(`Preparing export for ${markdownFiles.length} notes...`, 0);
		let exportFile: TFile | null = null;

		try {
			const exportMarkdown = await this.buildExportMarkdown(markdownFiles, exportOptions, (stage, processed, total) => {
				if (processed === total || processed % 25 === 0) {
					progressNotice.setMessage(`${stage}: ${processed}/${total}`);
				}
			});

			progressNotice.setMessage('Saving temporary export note...');
			exportFile = await this.upsertExportFile(exportMarkdown);

			progressNotice.setMessage('Opening export note and starting PDF export...');
			const leaf = this.app.workspace.getLeaf(true);
			await leaf.openFile(exportFile, {active: true});

			// Keep typescript happy :)
			const appWithCommands = this.app as AppWithCommands;
			if (!appWithCommands || !appWithCommands.commands) {
				progressNotice.hide();
				new Notice('PDF export command is not available in this environment.');
				return;
			}

			const exportCommandExists = appWithCommands.commands.findCommand('workspace:export-pdf');
			if (!exportCommandExists) {
				progressNotice.hide();
				new Notice('PDF export command is not available in this environment.');
				return;
			}

			await appWithCommands.commands.executeCommandById('workspace:export-pdf');
			progressNotice.hide();
			new Notice('PDF export started. Temporary export note kept to avoid premature deletion.', 6000);
		} catch (error) {
			if (exportFile) {
				try {
					await this.deleteExportFile(exportFile);
				} catch (cleanupError) {
					console.error('Failed to delete temporary export note', cleanupError);
				}
			}

			progressNotice.hide();
			new Notice('Vault export failed. Check console for details.');
			console.error('Vault to PDF export failed', error);
		}
	}

	private async promptExportOptions(): Promise<ExportOptions | null> {
		const defaultOptions: ExportOptions = {
			includeCoverPage: true,
			includeTableOfContents: true,
			pageBreakAfterEachNote: true
		};

		return new Promise((resolve) => {
			new ExportSettingsModal(this.app, defaultOptions, resolve).open();
		});
	}

	private getSortedVaultFiles(): TFile[] {
		const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
		const exportNotePath = this.getExportNotePath();

		return this.app.vault
			.getMarkdownFiles()
			.filter((file) => file.path !== exportNotePath && !file.path.startsWith('.obsidian/'))
			.sort((a, b) => {
				const folderCompare = this.comparePathSegments(a.parent?.path ?? '', b.parent?.path ?? '', collator);
				if (folderCompare !== 0) {
					return folderCompare;
				}

				return collator.compare(a.basename, b.basename);
			});
	}

	private comparePathSegments(pathA: string, pathB: string, collator: Intl.Collator): number {
		const partsA = pathA === '' ? [] : pathA.split('/');
		const partsB = pathB === '' ? [] : pathB.split('/');
		const maxLength = Math.max(partsA.length, partsB.length);

		for (let i = 0; i < maxLength; i++) {
			const segmentA = partsA[i];
			const segmentB = partsB[i];

			if (segmentA === undefined) {
				return -1;
			}
			if (segmentB === undefined) {
				return 1;
			}

			const segmentCompare = collator.compare(segmentA, segmentB);
			if (segmentCompare !== 0) {
				return segmentCompare;
			}
		}

		return 0;
	}

	private createAnchorId(prefix: string, path: string): string {
		const normalized = path
			.toLowerCase()
			.replace(/[^a-z0-9/_-]+/g, '-')
			.replace(/[/-]{2,}/g, '-')
			.replace(/^[-/]+|[-/]+$/g, '');

		return `${prefix}-${normalized || 'root'}`;
	}

	private escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	private async buildExportMarkdown(
		files: TFile[],
		options: ExportOptions,
		onProgress?: (stage: string, processed: number, total: number) => void
	): Promise<string> {
		const vaultName = this.app.vault.getName();
		const now = new Date().toLocaleString();
		const total = files.length;

		const lines: string[] = [];

		if (options.includeCoverPage) {
			lines.push(`# ${vaultName}`);
			lines.push('');
			lines.push('Complete Vault Export');
			lines.push('');
			lines.push(`Generated: ${now}`);
			lines.push('');

			if (options.includeTableOfContents || files.length > 0) {
				lines.push(this.pageBreakMarker);
				lines.push('');
			}
		}

		let previousFolders: string[] = [];
		if (options.includeTableOfContents) {
			lines.push('# Table of Contents');
			lines.push('');
			lines.push('<div class="vault-to-pdf-toc">');
			lines.push('');

			for (const [fileIndex, file] of files.entries()) {
				const folderSegments = file.parent?.path ? file.parent.path.split('/') : [];

				let commonPrefixLength = 0;
				while (
					commonPrefixLength < previousFolders.length &&
					commonPrefixLength < folderSegments.length &&
					previousFolders[commonPrefixLength] === folderSegments[commonPrefixLength]
				) {
					commonPrefixLength++;
				}

				for (let i = commonPrefixLength; i < folderSegments.length; i++) {
					const folderName = folderSegments[i];
					if (!folderName) {
						continue;
					}

					const folderPath = folderSegments.slice(0, i + 1).join('/');
					const folderAnchor = this.createAnchorId('folder', folderPath);
					lines.push(`${'  '.repeat(i)}- <a href="#${folderAnchor}">${this.escapeHtml(folderName)}</a>`);
				}

				const noteAnchor = this.createAnchorId('note', file.path);
				lines.push(`${'  '.repeat(folderSegments.length)}- <a href="#${noteAnchor}">${this.escapeHtml(file.basename)}</a>`);
				previousFolders = folderSegments;
				onProgress?.('Building table of contents', fileIndex + 1, total);
			}

			lines.push('');
			lines.push('</div>');

			lines.push('');
			lines.push(this.pageBreakMarker);
			lines.push('');
		}

		lines.push('# Notes');
		lines.push('');

		previousFolders = [];
		for (const [fileIndex, file] of files.entries()) {
			const folderSegments = file.parent?.path ? file.parent.path.split('/') : [];

			let commonPrefixLength = 0;
			while (
				commonPrefixLength < previousFolders.length &&
				commonPrefixLength < folderSegments.length &&
				previousFolders[commonPrefixLength] === folderSegments[commonPrefixLength]
			) {
				commonPrefixLength++;
			}

			for (let i = commonPrefixLength; i < folderSegments.length; i++) {
				const folderName = folderSegments[i];
				if (!folderName) {
					continue;
				}

				const folderPath = folderSegments.slice(0, i + 1).join('/');
				const folderAnchor = this.createAnchorId('folder', folderPath);
				const folderHeadingLevel = Math.min(i + 2, 6);
				lines.push(`<h${folderHeadingLevel} id="${folderAnchor}">${this.escapeHtml(folderName)}</h${folderHeadingLevel}>`);
				lines.push('');
			}

			const noteHeadingLevel = Math.min(folderSegments.length + 2, 6);
			const noteAnchor = this.createAnchorId('note', file.path);
			lines.push(`<h${noteHeadingLevel} id="${noteAnchor}">${this.escapeHtml(file.basename)}</h${noteHeadingLevel}>`);
			lines.push('');

			const noteContent = await this.app.vault.cachedRead(file);
			lines.push(noteContent.trimEnd());
			lines.push('');

			if (options.pageBreakAfterEachNote && fileIndex < files.length - 1) {
				lines.push(this.pageBreakMarker);
				lines.push('');
			}

			previousFolders = folderSegments;
			onProgress?.('Compiling notes', fileIndex + 1, total);
		}

		return `${lines.join('\n')}\n`;
	}

	private async upsertExportFile(content: string): Promise<TFile> {
		const normalizedPath = this.getExportNotePath();
		const existingFile = this.app.vault.getAbstractFileByPath(normalizedPath);

		if (existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, content);
			return existingFile;
		}

		if (existingFile !== null) {
			throw new Error(`Export path is not a file: ${normalizedPath}`);
		}

		const createdFile = await this.app.vault.create(normalizedPath, content);
		if (!createdFile) {
			throw new Error(`Failed to create export file: ${normalizedPath}`);
		}

		return createdFile;
	}

	private async deleteExistingExportFileIfAny(): Promise<void> {
		const existingFile = this.app.vault.getAbstractFileByPath(this.getExportNotePath());
		if (existingFile instanceof TFile) {
			await this.app.vault.delete(existingFile, true);
		}
	}

	private async deleteExportFile(file: TFile): Promise<void> {
		const fileInVault = this.app.vault.getAbstractFileByPath(file.path);
		if (fileInVault instanceof TFile) {
			await this.app.vault.delete(fileInVault, true);
		}
	}
	
}

class ExportSettingsModal extends Modal {
	private options: ExportOptions;
	private isResolved = false;

	constructor(
		app: App,
		initialOptions: ExportOptions,
		private readonly onResolve: (result: ExportOptions | null) => void
	) {
		super(app);
		this.options = {...initialOptions};
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl('h2', {text: 'Export settings'});

		new Setting(contentEl)
			.setName('Include cover page')
			.addToggle((toggle) =>
				toggle.setValue(this.options.includeCoverPage).onChange((value) => {
					this.options.includeCoverPage = value;
				})
			);

		new Setting(contentEl)
			.setName('Include table of contents')
			.addToggle((toggle) =>
				toggle.setValue(this.options.includeTableOfContents).onChange((value) => {
					this.options.includeTableOfContents = value;
				})
			);

		new Setting(contentEl)
			.setName('Page break after each note')
			.addToggle((toggle) =>
				toggle.setValue(this.options.pageBreakAfterEachNote).onChange((value) => {
					this.options.pageBreakAfterEachNote = value;
				})
			);

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => {
					this.resolveAndClose(null);
				})
			)
			.addButton((button) =>
				button
					.setButtonText('Export')
					.setCta()
					.onClick(() => {
						this.resolveAndClose(this.options);
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.isResolved) {
			this.isResolved = true;
			this.onResolve(null);
		}
	}

	private resolveAndClose(result: ExportOptions | null): void {
		if (this.isResolved) {
			return;
		}

		this.isResolved = true;
		this.onResolve(result ? {...result} : null);
		this.close();
	}
}
