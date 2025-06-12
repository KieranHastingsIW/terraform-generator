
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { Users, Shield, LockKeyhole, ListChecks, Tag, PlusCircle, XCircle, UserCircle, Copy, Loader2, RefreshCw, FileText, Server } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { profileConfiguratorSchema, type ProfileConfiguratorValues } from "@/lib/profile-configurator-schema";
import { generateTerraformConfig, type TerraformGenerationOutput } from "@/lib/terraform-generator";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { fetchNewClientId } from "@/services/keycloak-service";


export default function ProfileConfiguratorForm() {
  const { toast } = useToast();
  const [generatedTerraform, setGeneratedTerraform] = React.useState<TerraformGenerationOutput | null>(null);
  const [isFetchingOwnerId, setIsFetchingOwnerId] = React.useState(false);
  const [fetchedOwnerIds, setFetchedOwnerIds] = React.useState<string[]>([]);
  const [ownerIdMappingContent, setOwnerIdMappingContent] = React.useState<string | null>(null);


  const form = useForm<ProfileConfiguratorValues>({
    resolver: zodResolver(profileConfiguratorSchema),
    defaultValues: {
      applicationType: undefined,
      authProfileName: "",
      aclProfileName: "",
      queueName: "",
      ownerId: "",
      topics: [{ value: "" }],
      numberOfInstances: 1,
    },
    mode: "onChange",
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "topics",
  });

  const applicationType = form.watch("applicationType");
  const numberOfInstances = form.watch("numberOfInstances") ?? 1;

  const handleFetchOwnerId = async () => {
    setIsFetchingOwnerId(true);
    form.setValue("ownerId", "", { shouldValidate: true });
    setFetchedOwnerIds([]);
    setGeneratedTerraform(null);
    setOwnerIdMappingContent(null);

    const numInstancesToFetch = form.getValues("numberOfInstances") ?? 1;
    const currentAppType = form.getValues("applicationType");

    if (numInstancesToFetch > 1 && currentAppType === "subscriber") {
      const ids: string[] = [];
      let allFetchesSuccessful = true;
      toast({ title: "Batch Owner ID Fetch Started", description: `Attempting to fetch ${numInstancesToFetch} Owner IDs...`, duration: 2000 });

      for (let i = 0; i < numInstancesToFetch; i++) {
        try {
          // Individual toast for each attempt
          const fetchToast = toast({ title: `Fetching Owner ID ${i + 1} of ${numInstancesToFetch}...`, duration: 15000 }); // Long duration, will be dismissed
          const clientId = await fetchNewClientId();
          ids.push(clientId);
          fetchToast.dismiss(); // Dismiss individual fetch toast on success
          toast({ title: `Fetched Owner ID ${i + 1}`, description: `ID: ${clientId.substring(0,8)}...`, duration: 2000});

        } catch (error) {
          allFetchesSuccessful = false;
          let errorMessage = `Failed to fetch Owner ID ${i + 1}.`;
          if (error instanceof Error) errorMessage = error.message;
          toast({ title: "Error Fetching Owner ID", description: errorMessage, variant: "destructive", duration: 5000 });
          ids.push(`ErrorFetchingID_${i + 1}`); // Push a placeholder for error
        }
      }
      setFetchedOwnerIds(ids);
      if (allFetchesSuccessful) {
        toast({ title: `${numInstancesToFetch} Owner IDs Fetched Successfully`, description: "Owner IDs for all instances have been populated.", duration: 3000 });
      } else {
        toast({ title: "Owner ID Fetching Incomplete", description: "Some Owner IDs could not be fetched. Check individual errors and generated mapping.", variant: "destructive", duration: 5000 });
      }
    } else { // Single fetch logic (or publisher)
      try {
        const clientId = await fetchNewClientId();
        form.setValue("ownerId", clientId, { shouldValidate: true });
        toast({ title: "Owner ID Fetched", description: "Owner ID has been populated.", duration: 3000 });
      } catch (error) {
        let errorMessage = "Failed to fetch Owner ID from Keycloak.";
        if (error instanceof Error) errorMessage = error.message;
        toast({ title: "Error Fetching Owner ID", description: errorMessage, variant: "destructive", duration: 5000 });
        form.setValue("ownerId", "Error fetching ID", { shouldValidate: false });
      }
    }
    setIsFetchingOwnerId(false);
  };


  async function handleApplicationTypeChange(value: "publisher" | "subscriber" | undefined) {
    form.setValue("applicationType", value, { shouldValidate: true });
    setGeneratedTerraform(null);
    setOwnerIdMappingContent(null);
    form.setValue("ownerId", ""); // Clear ownerId when app type changes
    setFetchedOwnerIds([]);


    if (value !== "subscriber") {
      form.setValue("queueName", "", { shouldValidate: true });
    }
  }

  function onFormValueChange() {
    setGeneratedTerraform(null);
    setOwnerIdMappingContent(null);
  }


  function onSubmit(values: ProfileConfiguratorValues) {
    const numInstances = values.numberOfInstances ?? 1;
    if (applicationType === "subscriber" && numInstances > 1 && fetchedOwnerIds.length !== numInstances) {
        toast({
            title: "Cannot Generate Terraform",
            description: `Expected ${numInstances} fetched Owner IDs for subscriber instances, but found ${fetchedOwnerIds.length}. Please fetch IDs again.`,
            variant: "destructive",
            duration: 5000,
        });
        return;
    }
     if (applicationType === "subscriber" && numInstances > 1 && fetchedOwnerIds.some(id => id.startsWith("ErrorFetchingID_"))) {
        toast({
            title: "Cannot Generate Terraform",
            description: "One or more Owner IDs could not be fetched for subscriber instances. Please resolve errors or try fetching again.",
            variant: "destructive",
            duration: 5000,
        });
        return;
    }
    if (applicationType === "subscriber" && numInstances === 1 && values.ownerId === "Error fetching ID") {
        toast({
            title: "Cannot Generate Terraform",
            description: "Owner ID could not be fetched for Subscriber. Please enter a valid Owner ID or try fetching again.",
            variant: "destructive",
            duration: 5000,
        });
        return;
    }

    try {
      // Pass fetchedOwnerIds only if it's relevant (multi-instance subscriber)
      const ownerIdsForGenerator = (applicationType === "subscriber" && numInstances > 1) ? fetchedOwnerIds : undefined;
      const tfOutput = generateTerraformConfig(values, ownerIdsForGenerator);
      setGeneratedTerraform(tfOutput);
      if (tfOutput.ownerIdMapping) {
        setOwnerIdMappingContent(tfOutput.ownerIdMapping);
      }
      toast({
        title: "Terraform Code Generated",
        description: "The Terraform configuration has been generated below.",
        duration: 5000,
      });
    } catch (error) {
      console.error("Error generating Terraform:", error);
      let errorMessage = "Failed to generate Terraform configuration.";
      if (error instanceof Error) errorMessage = error.message;
      toast({ title: "Error Generating Terraform", description: errorMessage, variant: "destructive", duration: 5000 });
      setGeneratedTerraform(null);
      setOwnerIdMappingContent(null);
    }
  }

  const handleCopyToClipboard = (content: string | undefined, type: string) => {
    if (content) {
      navigator.clipboard.writeText(content)
        .then(() => {
          toast({ title: `Copied ${type} to clipboard!` });
        })
        .catch(err => {
          console.error(`Failed to copy ${type}: `, err);
          toast({ title: `Failed to copy ${type}`, description: `Could not copy ${type} to clipboard.`, variant: "destructive" });
        });
    }
  };
  
  const ownerIdPlaceholder = "Enter Owner ID or Fetch";
  const isMultiInstanceSubscriber = applicationType === "subscriber" && numberOfInstances > 1;


  return (
    <>
    <Card className="w-full max-w-2xl shadow-xl">
      <CardHeader>
        <CardTitle className="text-3xl font-headline tracking-tight">Profile Configurator</CardTitle>
        <CardDescription>Fill in the details below to generate Terraform configuration for your application profile(s).</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="applicationType"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="flex items-center text-base">
                    <Users className="mr-2 h-5 w-5 text-primary" />
                    Application Type
                  </FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={(type) => {
                        handleApplicationTypeChange(type as "publisher" | "subscriber");
                      }}
                      defaultValue={field.value}
                      className="flex flex-col space-y-2 pt-1 sm:flex-row sm:space-y-0 sm:space-x-6"
                    >
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="publisher" id="publisher"/>
                        </FormControl>
                        <FormLabel htmlFor="publisher" className="font-normal text-sm">
                          Publisher
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="subscriber" id="subscriber"/>
                        </FormControl>
                        <FormLabel htmlFor="subscriber" className="font-normal text-sm">
                          Subscriber
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="numberOfInstances"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center text-base">
                    <Server className="mr-2 h-5 w-5 text-primary" />
                    Number of Profiles to Create
                  </FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      min="1" 
                      placeholder="e.g., 1" 
                      {...field} 
                      onChange={(e) => {
                        const val = e.target.value === '' ? 1 : parseInt(e.target.value, 10);
                        field.onChange(val >= 1 ? val : 1);
                        onFormValueChange();
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="authProfileName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center text-base">
                    <Shield className="mr-2 h-5 w-5 text-primary" />
                    Base Auth Profile Name
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Enter base auth profile name" {...field} onChange={(e) => { field.onChange(e); onFormValueChange();}} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="aclProfileName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center text-base">
                    <LockKeyhole className="mr-2 h-5 w-5 text-primary" />
                    Base ACL Profile Name
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Enter base ACL profile name" {...field} onChange={(e) => { field.onChange(e); onFormValueChange();}} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {applicationType === "subscriber" && (
              <FormField
                control={form.control}
                name="queueName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center text-base">
                      <ListChecks className="mr-2 h-5 w-5 text-primary" />
                      Base Queue Name
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Enter base queue name" {...field} onChange={(e) => { field.onChange(e); onFormValueChange();}}/>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            <FormField
              control={form.control}
              name="ownerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center text-base">
                    <UserCircle className="mr-2 h-5 w-5 text-primary" />
                    Owner ID {isMultiInstanceSubscriber ? "(Handled by Batch Fetch)" : ""}
                    {isFetchingOwnerId && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  </FormLabel>
                  <div className="flex items-center space-x-2">
                    <FormControl>
                      <Input 
                        placeholder={ownerIdPlaceholder}
                        {...field} 
                        readOnly={isFetchingOwnerId || isMultiInstanceSubscriber}
                        disabled={isMultiInstanceSubscriber}
                        onChange={(e) => { field.onChange(e); onFormValueChange();}}
                        className={field.value === "Error fetching ID" ? "border-destructive text-destructive" : ""}
                        />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleFetchOwnerId}
                      disabled={isFetchingOwnerId || !applicationType}
                      className="shrink-0"
                    >
                      {isFetchingOwnerId ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      {isFetchingOwnerId ? "Fetching..." : (isMultiInstanceSubscriber ? `Fetch ${numberOfInstances} IDs` : "Fetch ID")}
                    </Button>
                  </div>
                  {isMultiInstanceSubscriber && fetchedOwnerIds.length > 0 && (
                    <p className="text-sm text-muted-foreground pt-1">
                      {fetchedOwnerIds.filter(id => !id.startsWith("ErrorFetchingID_")).length} of {numberOfInstances} IDs fetched successfully. See mapping below.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <div>
              <FormLabel className="flex items-center text-base mb-3">
                <Tag className="mr-2 h-5 w-5 text-primary" />
                Topics
              </FormLabel>
              {fields.map((item, index) => (
                <FormField
                  key={item.id}
                  control={form.control}
                  name={`topics.${index}.value`}
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 mb-2">
                      <FormControl>
                        <Input placeholder={`Topic ${index + 1} (e.g., data/events/*)`} {...field} onChange={(e) => { field.onChange(e); onFormValueChange();}}/>
                      </FormControl>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {remove(index); onFormValueChange();}}
                          aria-label="Remove topic"
                          className="text-destructive hover:text-destructive/80"
                        >
                          <XCircle className="h-5 w-5" />
                        </Button>
                      )}
                      <FormMessage className="col-span-2"/>
                    </FormItem>
                  )}
                />
              ))}
               {form.formState.errors.topics && typeof form.formState.errors.topics !== 'object' && !Array.isArray(form.formState.errors.topics) && (
                <p className="text-sm font-medium text-destructive">{form.formState.errors.topics.message}</p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {append({ value: "" }); onFormValueChange();}}
                className="mt-2 border-dashed hover:border-solid"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Topic
              </Button>
            </div>
            
            <FormMessage>{form.formState.errors.topics?.root?.message}</FormMessage>

          </form>
        </Form>
      </CardContent>
      <CardFooter>
        <Button 
          type="submit" 
          onClick={form.handleSubmit(onSubmit)} 
          className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 focus-visible:ring-ring"
          disabled={form.formState.isSubmitting || isFetchingOwnerId || !applicationType}
        >
          {form.formState.isSubmitting ? "Generating..." : (isFetchingOwnerId ? "Fetching Owner ID(s)..." : "Generate Terraform Code")}
        </Button>
      </CardFooter>
    </Card>

    {generatedTerraform?.fullTerraformConfig && (
        <Card className="w-full max-w-2xl shadow-xl mt-6">
          <CardHeader>
            <CardTitle className="text-2xl font-headline">Generated Terraform Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              readOnly
              value={generatedTerraform.fullTerraformConfig}
              className="min-h-[200px] font-mono text-sm bg-muted/20"
              aria-label="Generated Terraform Configuration"
            />
          </CardContent>
          <CardFooter>
            <Button onClick={() => handleCopyToClipboard(generatedTerraform.fullTerraformConfig, "Configuration")} variant="outline">
              <Copy className="mr-2 h-4 w-4" />
              Copy Configuration
            </Button>
          </CardFooter>
        </Card>
      )}

    {ownerIdMappingContent && (
        <Card className="w-full max-w-2xl shadow-xl mt-6">
          <CardHeader>
            <CardTitle className="flex items-center text-2xl font-headline">
                <FileText className="mr-2 h-6 w-6 text-primary" />
                Owner ID Mapping
            </CardTitle>
            <CardDescription>Mapping of generated instance names to their fetched Owner IDs.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              readOnly
              value={ownerIdMappingContent}
              className="min-h-[100px] font-mono text-sm bg-muted/20"
              aria-label="Owner ID Mapping"
            />
          </CardContent>
          <CardFooter>
            <Button onClick={() => handleCopyToClipboard(ownerIdMappingContent, "Owner ID Mapping")} variant="outline">
              <Copy className="mr-2 h-4 w-4" />
              Copy Mapping
            </Button>
          </CardFooter>
        </Card>
      )}
    <Toaster />
    </>
  );
}
