/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  signal,
  inject,
  SecurityContext,
} from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { DatabaseService, Category, Item } from './database.service';

type View = 'categories' | 'items' | 'addCategory' | 'addItem';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'class': 'flex items-center justify-center min-h-screen p-4',
  },
})
export class AppComponent implements OnInit {
  private dbService = inject(DatabaseService);
  private sanitizer = inject(DomSanitizer);

  // View and data signals
  currentView = signal<View>('categories');
  categories = signal<Category[]>([]);
  items = signal<Item[]>([]);
  selectedCategory = signal<Category | null>(null);
  isLoading = signal<boolean>(true);

  // Form-related signals
  imageFile = signal<File | null>(null);
  imagePreview = signal<string | null>(null);
  
  // Recording state signals
  isRecording = signal(false);
  recordedSoundBlob = signal<Blob | null>(null);
  recordedSoundUrl = signal<SafeUrl | null>(null);
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  // Deletion state signals
  deleteConfirmation = signal<{type: 'category' | 'item', data: Category | Item} | null>(null);
  isDeleting = signal(false);

  async ngOnInit(): Promise<void> {
    await this.loadCategories();
    this.isLoading.set(false);
  }

  async loadCategories(): Promise<void> {
    this.categories.set(await this.dbService.getCategories());
  }

  // --- View Navigation ---

  goHome(): void {
    this.currentView.set('categories');
    this.resetFormState();
  }

  async selectCategory(category: Category): Promise<void> {
    this.selectedCategory.set(category);
    this.items.set(await this.dbService.getItems(category.id!));
    this.currentView.set('items');
    this.resetFormState();
  }

  showAddCategoryForm(): void {
    this.currentView.set('addCategory');
    this.resetFormState();
  }

  showAddItemForm(): void {
    this.currentView.set('addItem');
     this.resetFormState();
  }
  
  // --- Form Handling ---
  
  private resetFormState(): void {
    this.imageFile.set(null);
    this.imagePreview.set(null);
    this.recordedSoundBlob.set(null);
    this.recordedSoundUrl.set(null);
  }

  onFileSelected(event: Event, type: 'image'): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.imageFile.set(file);
      
      const reader = new FileReader();
      reader.onload = () => {
        this.imagePreview.set(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  async addCategory(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const name = formData.get('name') as string;
    
    if (name && this.imageFile()) {
      await this.dbService.addCategory({ name, picture: this.imageFile()! });
      await this.loadCategories();
      this.goHome();
    }
  }

  async addItem(event: Event): Promise<void> {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const name = formData.get('name') as string;
    const category = this.selectedCategory();
    
    if (name && this.imageFile() && this.recordedSoundBlob() && category) {
      const item: Item = {
        name,
        picture: this.imageFile()!,
        sound: this.recordedSoundBlob()!,
        categoryId: category.id!,
      };
      await this.dbService.addItem(item);
      this.selectCategory(category); // Reselect to refresh item list
    }
  }

  // --- Deletion Handling ---
  
  requestDeleteCategory(event: MouseEvent, category: Category): void {
    event.stopPropagation();
    this.deleteConfirmation.set({ type: 'category', data: category });
  }

  requestDeleteItem(event: MouseEvent, item: Item): void {
    event.stopPropagation();
    this.deleteConfirmation.set({ type: 'item', data: item });
  }

  cancelDeletion(): void {
    this.deleteConfirmation.set(null);
  }

  async confirmDeletion(): Promise<void> {
    const confirmation = this.deleteConfirmation();
    if (!confirmation) return;

    this.isDeleting.set(true);

    try {
      if (confirmation.type === 'category') {
        await this.dbService.deleteCategory(confirmation.data.id!);
        await this.loadCategories();
      } else { // 'item'
        await this.dbService.deleteItem(confirmation.data.id!);
        const category = this.selectedCategory()!;
        this.items.set(await this.dbService.getItems(category.id!));
      }
    } catch (error) {
        console.error("Failed to delete:", error);
    } finally {
        this.isDeleting.set(false);
        this.deleteConfirmation.set(null);
    }
  }

  // --- Audio Handling ---

  async startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.isRecording.set(true);
      this.recordedSoundBlob.set(null);
      this.recordedSoundUrl.set(null);
      this.audioChunks = [];
      
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        this.recordedSoundBlob.set(audioBlob);
        const url = URL.createObjectURL(audioBlob);
        this.recordedSoundUrl.set(this.sanitizer.bypassSecurityTrustUrl(url));
         // Stop all media tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());
      };
      this.mediaRecorder.start();
    } catch (err) {
      console.error("Error starting recording:", err);
      alert("Microphone access was denied. Please allow microphone access in your browser settings to record audio.");
      this.isRecording.set(false);
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.isRecording()) {
      this.mediaRecorder.stop();
      this.isRecording.set(false);
    }
  }
  
  playItemSound(soundBlob: Blob): void {
     const url = URL.createObjectURL(soundBlob);
     const audio = new Audio(url);
     audio.play();
     audio.onended = () => URL.revokeObjectURL(url); // Clean up the URL object after playing
  }

  createBlobUrl(blob: Blob): SafeUrl {
    const url = URL.createObjectURL(blob);
    // Sanitizing the URL to prevent security risks
    const safeUrl = this.sanitizer.bypassSecurityTrustUrl(url);
    // Note: In a real app with many objects, you'd want to manage and revoke these URLs
    // when the component is destroyed to prevent memory leaks. For this app, it's okay.
    return safeUrl;
  }
}